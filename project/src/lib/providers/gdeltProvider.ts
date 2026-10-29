import type { NewsItem, ProviderHealth, Category, Sentiment, Urgency } from '../../types';
import type { NewsProvider, ProviderFetchOptions } from './types';
import { processGeographicData } from '../pipeline/geoProcessor';

interface GDELTArticle {
  url?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

const REGION_MAP: Record<string, { id: string; name: string; lat: number; lng: number }> = {
  delhi: { id: 'delhi', name: 'Delhi NCR', lat: 28.61, lng: 77.21 },
  mumbai: { id: 'mumbai', name: 'Mumbai', lat: 19.07, lng: 72.87 },
  bengaluru: { id: 'bengaluru', name: 'Bengaluru', lat: 12.97, lng: 77.59 },
  kolkata: { id: 'kolkata', name: 'Kolkata', lat: 22.57, lng: 88.36 },
  chennai: { id: 'chennai', name: 'Chennai', lat: 13.08, lng: 80.27 },
  hyderabad: { id: 'hyderabad', name: 'Hyderabad', lat: 17.38, lng: 78.48 },
  global: { id: 'global', name: 'Global', lat: 0, lng: 0 },
};

function inferCategory(title: string): Category {
  const lower = title.toLowerCase();
  if (/\b(ai|tech|software|apple|google|microsoft|chip|cyber|app|data|cloud|quantum)\b/.test(lower)) return 'Technology';
  if (/\b(election|parliament|government|minister|court|policy|bill|party|president|senate)\b/.test(lower)) return 'Politics';
  if (/\b(market|stock|bank|economy|dollar|rupee|rbi|finance|growth|trade|gdp|inflation|fed)\b/.test(lower)) return 'Business';
  if (/\b(cricket|football|soccer|match|tournament|kohli|sports|olympics|league|fifa)\b/.test(lower)) return 'Sports';
  if (/\b(climate|green|forest|environment|carbon|pollution|renewable|cop|energy)\b/.test(lower)) return 'Environment';
  if (/\b(health|hospital|doctor|virus|medical|pharma|vaccine|cancer)\b/.test(lower)) return 'Health';
  if (/\b(space|isro|nasa|science|research|physics|astronomy)\b/.test(lower)) return 'Science';
  if (/\b(india|delhi|mumbai|bengaluru)\b/.test(lower)) return 'India';
  return 'World';
}

function inferRegion(title: string, country?: string) {
  const lower = title.toLowerCase();
  if (lower.includes('delhi')) return REGION_MAP.delhi;
  if (lower.includes('mumbai')) return REGION_MAP.mumbai;
  if (lower.includes('bengaluru') || lower.includes('bangalore')) return REGION_MAP.bengaluru;
  if (lower.includes('kolkata')) return REGION_MAP.kolkata;
  if (lower.includes('chennai')) return REGION_MAP.chennai;
  if (lower.includes('hyderabad')) return REGION_MAP.hyderabad;
  if (country?.toLowerCase() === 'india' || lower.includes('india')) return { id: 'india', name: 'India', lat: 20.59, lng: 78.96 };
  return REGION_MAP.global;
}

/**
 * Strict GDELT date format parser (YYYYMMDDHHMMSS).
 * Preserves missing timestamps as null rather than fabricating Date.now().
 */
export function parseGDELTDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const parsed = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
    return isNaN(parsed) ? null : parsed;
  }
  const parsed = new Date(dateStr).getTime();
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

import { formatProviderError } from './types';
import { gdeltScheduler, type GDELTNetworkResult } from './gdeltScheduler';
import { analyzeArticleSentiment } from '../pipeline/sentimentAnalyzer';

export class GDELTProvider implements NewsProvider {
  readonly name = 'GDELT' as const;
  readonly isConfigured = true;
  private cachedArticles: NewsItem[] = [];

  private health: ProviderHealth = {
    name: 'GDELT',
    enabled: true,
    status: 'Healthy',
    lastFetchTime: null,
    lastSuccessTime: null,
    totalFetched: 0,
    errorCount: 0,
    lastError: null,
    endpointUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    latencyMs: null,
    note: 'Broad news discovery API (free, rate limited to 1 request / 5s)',
    httpStatus: null,
    rawArticlesFetched: 0,
    validArticles: 0,
    duplicateArticles: 0,
    rejectedArticles: 0,
    insertedArticles: 0,
    nextEligibleTime: null,
    retryAfterSeconds: 0,
  };

  getProviderStatus(): ProviderHealth {
    const schedulerStatus = gdeltScheduler.getSchedulerStatus();
    if (schedulerStatus.isRateLimited && schedulerStatus.retryAfterSecondsRemaining > 0) {
      return {
        ...this.health,
        status: 'Rate Limited',
        lastError: `GDELT Rate Limit (HTTP 429): retry after ${schedulerStatus.retryAfterSecondsRemaining}s (cooldown active)`,
        nextEligibleTime: schedulerStatus.rateLimitCooldownUntil,
        retryAfterSeconds: schedulerStatus.retryAfterSecondsRemaining,
      };
    }
    return { 
      ...this.health,
      nextEligibleTime: schedulerStatus.rateLimitCooldownUntil,
      retryAfterSeconds: schedulerStatus.retryAfterSecondsRemaining,
    };
  }

  getDiagnostics() {
    return gdeltScheduler.getDiagnostics();
  }

  getSchedulerStatus() {
    return gdeltScheduler.getSchedulerStatus();
  }

  updateMetrics(metrics: Partial<ProviderHealth>): void {
    Object.assign(this.health, metrics);
  }

  resetCache(): void {
    gdeltScheduler.resetScheduler();
    this.cachedArticles = [];
  }

  async fetchNews(options?: ProviderFetchOptions): Promise<NewsItem[]> {
    const baseQuery = options?.query || '(technology OR business OR politics OR sports OR world)';
    const limit = Math.min(35, options?.limit || 25);
    const queryKey = `${baseQuery}__limit_${limit}`;

    const fetchResult = await gdeltScheduler.scheduleFetch(
      queryKey,
      () => this.performNetworkRequest(baseQuery, limit, options),
      { signal: options?.signal, bypassCache: options?.bypassCache }
    );

    const now = Date.now();
    this.health.lastFetchTime = now;
    this.health.httpStatus = fetchResult.httpStatus;
    this.health.fromCache = fetchResult.fromCache;

    if (fetchResult.isCancelled) {
      // Intentional client cancellation: retain current health status and return cached items without error notice
      return this.cachedArticles;
    }

    if (fetchResult.cooldownActive) {
      this.health.status = 'Rate Limited';
      this.health.nextEligibleTime = gdeltScheduler.getSchedulerStatus().rateLimitCooldownUntil;
      this.health.retryAfterSeconds = fetchResult.retryAfterSeconds;
      this.health.lastError = fetchResult.error || `GDELT Rate Limit (HTTP 429): retry after ${fetchResult.retryAfterSeconds}s (cooldown active)`;
      this.health.errorCount++;
      return this.cachedArticles;
    }

    if (fetchResult.success) {
      this.health.status = 'Healthy';
      this.health.lastSuccessTime = now;
      this.health.totalFetched += fetchResult.items.length;
      this.health.validArticles = fetchResult.items.length;
      this.health.lastError = null;
      this.health.nextEligibleTime = gdeltScheduler.getSchedulerStatus().rateLimitCooldownUntil;
      this.health.retryAfterSeconds = 0;
      this.cachedArticles = fetchResult.items;
      return fetchResult.items;
    }

    // In error or rate limited
    if (fetchResult.httpStatus === 429) {
      this.health.status = 'Rate Limited';
      this.health.errorCount++;
      this.health.lastError = fetchResult.error || 'GDELT Rate Limit (HTTP 429)';
    } else {
      this.health.status = this.cachedArticles.length > 0 ? 'Degraded' : 'Offline';
      this.health.errorCount++;
      this.health.lastError = fetchResult.error || 'GDELT request failed';
    }

    return this.cachedArticles;
  }

  private async performNetworkRequest(
    baseQuery: string,
    limit: number,
    options?: ProviderFetchOptions
  ): Promise<GDELTNetworkResult> {
    const startTime = performance.now();
    const url = `${this.health.endpointUrl}?query=${encodeURIComponent(baseQuery)}&mode=artlist&maxrecords=${limit}&format=json`;

    const timeoutDuration = options?.timeoutMs || 20000;
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

    let res: Response | null = null;
    const isBrowser = typeof window !== 'undefined';

    const endpointsToTry = isBrowser
      ? [
          `/api/proxy?url=${encodeURIComponent(url)}`,
          url,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        ]
      : [url];

    let lastFetchErr: unknown = null;
    for (const endpoint of endpointsToTry) {
      try {
        const fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
        if (!isBrowser) {
          fetchHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPulse/1.0';
        }

        const candidateRes = await fetch(endpoint, {
          signal: controller.signal,
          headers: fetchHeaders,
        });

        res = candidateRes;
        if (candidateRes.ok || candidateRes.status === 429) {
          break;
        }
      } catch (e) {
        lastFetchErr = e;
        if (timedOut || controller.signal.aborted) break;
      }
    }

    clearTimeout(timeout);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);

    if (!res) {
      const formatted = formatProviderError('GDELT', lastFetchErr, timedOut);
      if (timedOut || formatted.isTimeout) {
        return {
          httpStatus: null,
          isTimedOut: true,
          statusText: formatted.message,
          items: [],
        };
      }
      if (formatted.isAborted) {
        return {
          httpStatus: null,
          isCancelled: true,
          statusText: formatted.message,
          items: [],
        };
      }
      return {
        httpStatus: null,
        statusText: formatted.message,
        items: [],
      };
    }

    const durationMs = Math.round(performance.now() - startTime);
    this.health.latencyMs = durationMs;
    const retryAfterHeader = res.headers.get('retry-after');

    if (res.status === 429) {
      return {
        httpStatus: 429,
        statusText: 'Too Many Requests',
        retryAfterHeader,
        isRateLimitNotice: true,
      };
    }

    const text = await res.text();

    if (text.includes('Please limit requests') || text.includes('high-traffic users') || text.includes('one every 5 seconds')) {
      return {
        httpStatus: 429,
        statusText: 'Rate limit notice detected in body',
        retryAfterHeader,
        isRateLimitNotice: true,
      };
    }

    if (!res.ok) {
      return {
        httpStatus: res.status,
        statusText: res.statusText,
        retryAfterHeader,
      };
    }

    let data: { articles?: GDELTArticle[] } = {};
    try {
      data = JSON.parse(text);
    } catch {
      return {
        httpStatus: res.status,
        statusText: 'Malformed JSON response',
      };
    }

    const rawArticles: GDELTArticle[] = Array.isArray(data.articles) ? data.articles : [];
    this.health.rawArticlesFetched = rawArticles.length;
    const seenUrls = new Set<string>();
    const allResults: NewsItem[] = [];
    const now = Date.now();

    for (const art of rawArticles) {
      if (!art.title || !art.url || seenUrls.has(art.url)) continue;
      seenUrls.add(art.url);

      const title = art.title.trim();
      const publishedAt = parseGDELTDate(art.seendate);
      const category = inferCategory(title);
      const sentimentRes = analyzeArticleSentiment({ title, description: title });
      const sentiment = sentimentRes.sentiment;
      const score = sentimentRes.score;
      const geo = processGeographicData({
        country: art.sourcecountry,
        headlineOrTitle: title,
      });
      const domain = art.domain || new URL(art.url).hostname.replace(/^www\./, '');

      const urgencyScore = Math.min(100, Math.max(10, Math.round(50 + Math.abs(score) * 30 + (title.toLowerCase().includes('breaking') ? 20 : 0))));
      let urgency: Urgency = 'low';
      if (urgencyScore >= 80) urgency = 'critical';
      else if (urgencyScore >= 60) urgency = 'high';
      else if (urgencyScore >= 40) urgency = 'medium';

      let canonicalUrl = art.url;
      try {
        const parsed = new URL(art.url);
        parsed.search = '';
        canonicalUrl = parsed.toString().replace(/\/$/, '');
      } catch {
        canonicalUrl = art.url.split('?')[0];
      }

      allResults.push({
        id: `gdelt-${publishedAt || now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: title,
        url: art.url,
        source: domain,
        author: null,
        category,
        sentiment,
        sentimentScore: score,
        sentimentStatus: sentimentRes.status,
        sentimentModel: sentimentRes.model,
        sentimentReason: sentimentRes.reason,
        urgencyScore,
        urgency,
        region: {
          id: geo.regionId,
          name: geo.regionName,
          lat: geo.latitude ?? 0,
          lng: geo.longitude ?? 0,
        },
        country: geo.country || art.sourcecountry || null,
        latitude: geo.latitude,
        longitude: geo.longitude,
        cityName: geo.cityName,
        locationType: geo.locationType,
        language: art.language || 'English',
        imageUrl: art.socialimage || null,
        provider: 'GDELT',
        timestamp: publishedAt,
        fetchedAt: now,
        summary: `GDELT ingested record from publisher ${domain}`,
        canonicalUrl,
        contentHash: `${title.toLowerCase()}|${domain.toLowerCase()}`,
        qualityScore: title.length > 20 ? 95 : 75,
        isSynthetic: false,
        origin: 'live',
        rawData: art as unknown as Record<string, unknown>,
      });
    }

    return {
      httpStatus: 200,
      statusText: 'OK',
      retryAfterHeader,
      items: allResults,
    };
  }
}
