import type { NewsItem, ProviderHealth, Category, Sentiment, Urgency } from '../../types';
import type { NewsProvider, ProviderFetchOptions } from './types';

interface GuardianArticle {
  id?: string;
  webTitle?: string;
  webUrl?: string;
  webPublicationDate?: string;
  sectionName?: string;
  fields?: {
    trailText?: string;
    thumbnail?: string;
    byline?: string;
  };
}

import { formatProviderError } from './types';
import { analyzeArticleSentiment } from '../pipeline/sentimentAnalyzer';

export class GuardianProvider implements NewsProvider {
  readonly name = 'The Guardian' as const;
  private explicitApiKey: string | null = null;
  private inFlightPromise: Promise<NewsItem[]> | null = null;
  private cachedArticles: NewsItem[] = [];
  private health: ProviderHealth;

  constructor(initialKey?: string) {
    if (initialKey !== undefined) {
      this.explicitApiKey = initialKey;
    }
    const currentKey = this.getApiKey();
    const hasKey = Boolean(currentKey && !currentKey.includes('placeholder'));
    const isTestKey = currentKey === 'test';

    this.health = {
      name: 'The Guardian',
      enabled: hasKey && !isTestKey,
      status: !hasKey 
        ? 'Not Configured' 
        : isTestKey 
        ? 'Offline' 
        : 'Healthy',
      lastFetchTime: null,
      lastSuccessTime: null,
      totalFetched: 0,
      errorCount: 0,
      lastError: !hasKey 
        ? 'Not configured — add a valid Guardian API key to enable this provider.' 
        : isTestKey 
        ? 'Authentication failed — verify the configured Guardian API key.' 
        : null,
      endpointUrl: 'https://content.guardianapis.com/search',
      latencyMs: null,
      note: 'The Guardian Open Platform (Optional API key)',
      httpStatus: null,
      rawArticlesFetched: 0,
      validArticles: 0,
      duplicateArticles: 0,
      rejectedArticles: 0,
      insertedArticles: 0,
      nextEligibleTime: null,
    };
  }

  getApiKey(): string {
    if (this.explicitApiKey !== null) {
      return this.explicitApiKey.trim();
    }

    const fromEnv = 
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GUARDIAN_API_KEY) ||
      (typeof process !== 'undefined' && process.env && process.env.VITE_GUARDIAN_API_KEY) ||
      '';
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();

    if (typeof window !== 'undefined' && window.localStorage) {
      const fromStorage = window.localStorage.getItem('VITE_GUARDIAN_API_KEY') || window.localStorage.getItem('GUARDIAN_API_KEY');
      if (fromStorage && fromStorage.trim()) return fromStorage.trim();
    }

    return '';
  }

  setApiKey(key: string): void {
    this.explicitApiKey = key.trim();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('VITE_GUARDIAN_API_KEY', this.explicitApiKey);
    }
    this.syncKeyStatus();
  }

  private syncKeyStatus(): void {
    const trimmedKey = this.getApiKey();
    const hasKey = Boolean(trimmedKey && !trimmedKey.includes('placeholder'));
    const isTestKey = trimmedKey === 'test';

    this.health.enabled = hasKey && !isTestKey;
    if (!hasKey) {
      this.health.status = 'Not Configured';
      this.health.lastError = 'Not configured — add a valid Guardian API key to enable this provider.';
    } else if (isTestKey) {
      this.health.status = 'Offline';
      this.health.lastError = 'Authentication failed — verify the configured Guardian API key.';
    } else if (this.health.status === 'Not Configured') {
      this.health.status = 'Healthy';
      this.health.lastError = null;
    }
  }

  get isConfigured(): boolean {
    const trimmedKey = this.getApiKey();
    return Boolean(trimmedKey && trimmedKey !== 'test' && !trimmedKey.includes('placeholder'));
  }

  getProviderStatus(): ProviderHealth {
    this.syncKeyStatus();
    return { ...this.health, enabled: this.isConfigured };
  }

  updateMetrics(metrics: Partial<ProviderHealth>): void {
    Object.assign(this.health, metrics);
  }

  async fetchNews(options?: ProviderFetchOptions): Promise<NewsItem[]> {
    this.syncKeyStatus();
    const trimmedKey = this.getApiKey();
    if (!trimmedKey) {
      this.health.status = 'Not Configured';
      this.health.lastError = 'Not configured — add a valid Guardian API key to enable this provider.';
      return [];
    }

    if (trimmedKey === 'test') {
      this.health.status = 'Offline';
      this.health.lastError = 'Authentication failed — verify the configured Guardian API key.';
      return [];
    }

    if (this.health.nextEligibleTime && this.health.nextEligibleTime > Date.now() && !options?.bypassCache) {
      const remainingSec = Math.ceil((this.health.nextEligibleTime - Date.now()) / 1000);
      this.health.lastError = `The Guardian Rate Limit: cooldown active (${remainingSec}s remaining)`;
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

    const query = encodeURIComponent(options?.query || 'world OR technology OR business OR politics');
    const allResults: NewsItem[] = [];
    const seenUrls = new Set<string>();

    const pageSize = Math.min(25, options?.limit || 20);
    const apiKey = this.getApiKey();
    const url = `${this.health.endpointUrl}?q=${query}&page=1&page-size=${pageSize}&show-fields=trailText,thumbnail,byline&api-key=${apiKey}`;

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
      const formatted = formatProviderError('The Guardian', fetchErr, timedOut);
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

      if (res.status === 401 || res.status === 403) {
        this.health.lastError = 'Authentication failed — verify the configured Guardian API key.';
        this.health.status = 'Offline';
        this.health.errorCount++;
        return [];
      }

      if (res.status === 429) {
        this.health.lastError = 'The Guardian Rate Limit Exceeded (HTTP 429)';
        this.health.status = 'Rate Limited';
        this.health.nextEligibleTime = Date.now() + 60000;
        this.health.errorCount++;
        return this.cachedArticles;
      }

      if (!res.ok) {
        this.health.lastError = `The Guardian HTTP ${res.status}: ${res.statusText}`;
        this.health.status = 'Degraded';
        this.health.errorCount++;
        return this.cachedArticles;
      }

      const data = await res.json();
      const articles: GuardianArticle[] = data.response?.results || [];
      this.health.rawArticlesFetched = articles.length;

      for (const art of articles) {
        if (!art.webTitle || !art.webUrl || seenUrls.has(art.webUrl)) continue;
        seenUrls.add(art.webUrl);

        const title = art.webTitle.trim();
        let pubDate: number | null = null;
        if (art.webPublicationDate) {
          const parsed = new Date(art.webPublicationDate).getTime();
          if (!isNaN(parsed) && parsed > 0) pubDate = parsed;
        }

        const section = art.sectionName || 'World';
        let category: Category = 'World';
        if (/tech/i.test(section)) category = 'Technology';
        else if (/politics|government/i.test(section)) category = 'Politics';
        else if (/business|money|economy/i.test(section)) category = 'Business';
        else if (/sport/i.test(section)) category = 'Sports';
        else if (/science/i.test(section)) category = 'Science';
        else if (/environment|climate/i.test(section)) category = 'Environment';

        let canonicalUrl = art.webUrl;
        try {
          const parsed = new URL(art.webUrl);
          parsed.search = '';
          canonicalUrl = parsed.toString().replace(/\/$/, '');
        } catch {
          canonicalUrl = art.webUrl.split('?')[0];
        }

        const description = art.fields?.trailText ? art.fields.trailText.replace(/<[^>]*>/g, '') : title;
        const sentimentRes = analyzeArticleSentiment({ title, description });

        allResults.push({
          id: `guardian-${pubDate || now}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          description,
          url: art.webUrl,
          source: 'The Guardian',
          author: art.fields?.byline || null,
          category,
          sentiment: sentimentRes.sentiment,
          sentimentScore: sentimentRes.score,
          sentimentStatus: sentimentRes.status,
          sentimentModel: sentimentRes.model,
          sentimentReason: sentimentRes.reason,
          urgencyScore: 45,
          urgency: 'medium' as Urgency,
          region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
          country: 'UK',
          language: 'en',
          imageUrl: art.fields?.thumbnail || null,
          provider: 'The Guardian',
          timestamp: pubDate,
          fetchedAt: now,
          summary: description,
          canonicalUrl,
          contentHash: `${title.toLowerCase()}|the guardian`,
          qualityScore: 95,
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
        this.health.lastError = 'Query succeeded (HTTP 200) but no matching articles returned';
      }
    } catch (err) {
      clearTimeout(timeout);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);

      const formatted = formatProviderError('The Guardian', err, timedOut);
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
