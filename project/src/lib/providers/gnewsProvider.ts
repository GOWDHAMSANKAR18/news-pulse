import type { NewsItem, ProviderHealth, Category, Sentiment, Urgency } from '../../types';
import type { NewsProvider, ProviderFetchOptions } from './types';

interface GNewsArticle {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  image?: string;
  publishedAt?: string;
  source?: { name?: string; url?: string };
}

import { formatProviderError } from './types';
import { analyzeArticleSentiment } from '../pipeline/sentimentAnalyzer';

export class GNewsProvider implements NewsProvider {
  readonly name = 'GNews' as const;
  private apiKey: string;
  private inFlightPromise: Promise<NewsItem[]> | null = null;
  private cachedArticles: NewsItem[] = [];
  private health: ProviderHealth;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? (
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GNEWS_API_KEY) ||
      (typeof process !== 'undefined' && process.env && process.env.VITE_GNEWS_API_KEY) ||
      ''
    );
    const isConfigured = Boolean(this.apiKey && !this.apiKey.includes('placeholder'));

    this.health = {
      name: 'GNews',
      enabled: isConfigured,
      status: isConfigured ? 'Healthy' : 'Not Configured',
      lastFetchTime: null,
      lastSuccessTime: null,
      totalFetched: 0,
      errorCount: 0,
      lastError: isConfigured ? null : 'Not configured — add a valid GNews API key to enable this provider.',
      endpointUrl: 'https://gnews.io/api/v4/top-headlines',
      latencyMs: null,
      note: 'GNews API (Free tier: 12-hour delayed feed, 100 requests/day)',
      httpStatus: null,
      rawArticlesFetched: 0,
      validArticles: 0,
      duplicateArticles: 0,
      rejectedArticles: 0,
      insertedArticles: 0,
      nextEligibleTime: null,
    };
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && !this.apiKey.includes('placeholder'));
  }

  getProviderStatus(): ProviderHealth {
    return { ...this.health, enabled: this.isConfigured };
  }

  updateMetrics(metrics: Partial<ProviderHealth>): void {
    Object.assign(this.health, metrics);
  }

  async fetchNews(options?: ProviderFetchOptions): Promise<NewsItem[]> {
    if (!this.isConfigured) {
      this.health.status = 'Not Configured';
      this.health.lastError = 'Not configured — add a valid GNews API key to enable this provider.';
      return [];
    }

    if (this.health.nextEligibleTime && this.health.nextEligibleTime > Date.now() && !options?.bypassCache) {
      const remainingSec = Math.ceil((this.health.nextEligibleTime - Date.now()) / 1000);
      this.health.lastError = `GNews Rate Limit: cooldown active (${remainingSec}s remaining)`;
      return this.cachedArticles;
    }

    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.performFetch(options);
    try {
      return await this.inFlightPromise;
    } finally {
      this.inFlightPromise = null;
    }
  }

  private async performFetch(options?: ProviderFetchOptions): Promise<NewsItem[]> {
    const now = Date.now();
    this.health.lastFetchTime = now;
    const startTime = performance.now();

    const category = options?.category ? options.category.toLowerCase() : 'general';
    const limit = Math.min(10, options?.limit || 10);
    const allResults: NewsItem[] = [];

    const url = `${this.health.endpointUrl}?category=${category}&lang=en&max=${limit}&apikey=${this.apiKey}`;

    const timeoutDuration = options?.timeoutMs || 18000;
    const controller = new AbortController();
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutDuration);

    const parentSignal = options?.signal;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    const isBrowser = typeof window !== 'undefined';
    const endpointsToTry = isBrowser ? [`/api/proxy?url=${encodeURIComponent(url)}`, url] : [url];
    let res: Response | null = null;
    let fetchErr: unknown = null;

    for (const endpoint of endpointsToTry) {
      try {
        const candidate = await fetch(endpoint, { signal: controller.signal });
        if (candidate.ok || candidate.status === 401 || candidate.status === 403 || candidate.status === 429) {
          res = candidate;
          break;
        }
      } catch (e) {
        fetchErr = e;
        if (timedOut || controller.signal.aborted) break;
      }
    }

    clearTimeout(timeout);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);

    if (!res) {
      const formatted = formatProviderError('GNews', fetchErr, timedOut);
      if (formatted.isAborted && !formatted.isTimeout) return this.cachedArticles;
      this.health.errorCount++;
      this.health.status = this.cachedArticles.length > 0 ? 'Degraded' : 'Offline';
      this.health.lastError = formatted.message;
      return this.cachedArticles;
    }

    try {

      const durationMs = Math.round(performance.now() - startTime);
      this.health.latencyMs = durationMs;
      this.health.httpStatus = res.status;

      if (res.status === 429) {
        this.health.lastError = 'GNews Daily Quota Exceeded (HTTP 429)';
        this.health.status = 'Rate Limited';
        this.health.nextEligibleTime = Date.now() + 60000;
        this.health.errorCount++;
        return this.cachedArticles;
      }

      if (res.status === 403 || res.status === 401) {
        this.health.lastError = `Authentication failed — verify the configured GNews API key (HTTP ${res.status})`;
        this.health.status = 'Offline';
        this.health.errorCount++;
        return [];
      }

      if (!res.ok) {
        this.health.lastError = `GNews HTTP ${res.status}: ${res.statusText}`;
        this.health.status = 'Degraded';
        this.health.errorCount++;
        return this.cachedArticles;
      }

      const data = await res.json();
      const articles: GNewsArticle[] = Array.isArray(data.articles) ? data.articles : [];
      this.health.rawArticlesFetched = articles.length;

      for (const art of articles) {
        if (!art.title || !art.url) continue;

        const title = art.title.trim();
        let pubDate: number | null = null;
        if (art.publishedAt) {
          const parsed = new Date(art.publishedAt).getTime();
          if (!isNaN(parsed) && parsed > 0) pubDate = parsed;
        }

        const sourceName = art.source?.name || 'GNews';

        let canonicalUrl = art.url;
        try {
          const parsed = new URL(art.url);
          parsed.search = '';
          canonicalUrl = parsed.toString().replace(/\/$/, '');
        } catch {
          canonicalUrl = art.url.split('?')[0];
        }

        const description = art.description || title;
        const sentimentRes = analyzeArticleSentiment({ title, description });

        allResults.push({
          id: `gnews-${pubDate || now}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          description,
          url: art.url,
          source: sourceName,
          author: null,
          category: 'General' as Category,
          sentiment: sentimentRes.sentiment,
          sentimentScore: sentimentRes.score,
          sentimentStatus: sentimentRes.status,
          sentimentModel: sentimentRes.model,
          sentimentReason: sentimentRes.reason,
          urgencyScore: 50,
          urgency: 'medium' as Urgency,
          region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
          country: null,
          language: 'en',
          imageUrl: art.image || null,
          provider: 'GNews',
          timestamp: pubDate,
          fetchedAt: now,
          summary: description,
          canonicalUrl,
          contentHash: `${title.toLowerCase()}|${sourceName.toLowerCase()}`,
          qualityScore: 90,
          isSynthetic: false,
          origin: 'live',
          rawData: art as unknown as Record<string, unknown>,
        });
      }

      this.health.validArticles = allResults.length;
      if (allResults.length > 0) {
        this.health.status = 'Healthy';
        this.health.lastSuccessTime = now;
        this.health.totalFetched += allResults.length;
        this.health.lastError = null;
        this.cachedArticles = allResults;
      } else {
        this.health.status = 'Fetched Zero Articles';
        this.health.lastError = 'GNews request succeeded (HTTP 200) but returned 0 articles';
      }
    } catch (err) {
      clearTimeout(timeout);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);

      const formatted = formatProviderError('GNews', err, timedOut);
      if (formatted.isAborted && !formatted.isTimeout) {
        return this.cachedArticles;
      }
      this.health.errorCount++;
      this.health.status = this.cachedArticles.length > 0 ? 'Degraded' : 'Offline';
      this.health.lastError = formatted.message;
      return this.cachedArticles;
    }

    return allResults;
  }
}
