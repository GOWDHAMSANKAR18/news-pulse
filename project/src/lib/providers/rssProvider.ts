import type { NewsItem, ProviderHealth, Category, Sentiment, Urgency } from '../../types';
import type { NewsProvider, ProviderFetchOptions } from './types';
import { parseRssOrAtomXml } from '../pipeline/rssXmlParser';
import { formatProviderError } from './types';
import { analyzeArticleSentiment } from '../pipeline/sentimentAnalyzer';

interface RSSFeedConfig {
  source: string;
  url: string;
  defaultCategory: Category;
}

const FEEDS: RSSFeedConfig[] = [
  { source: "TechCrunch", url: "https://techcrunch.com/feed/", defaultCategory: "Technology" },
  { source: "Wired", url: "https://www.wired.com/feed/rss", defaultCategory: "Technology" },
  { source: "The Verge", url: "https://www.theverge.com/rss/index.xml", defaultCategory: "Technology" },
  { source: "The Guardian", url: "https://www.theguardian.com/world/rss", defaultCategory: "World" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", defaultCategory: "World" },
  { source: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", defaultCategory: "Politics" },
  { source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", defaultCategory: "India" },
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms", defaultCategory: "Business" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", defaultCategory: "Science" },
];

export class RSSProvider implements NewsProvider {
  readonly name = 'RSS' as const;
  readonly isConfigured = true;
  private inFlightPromise: Promise<NewsItem[]> | null = null;
  private cachedArticles: NewsItem[] = [];

  private health: ProviderHealth = {
    name: 'RSS',
    enabled: true,
    status: 'Healthy',
    lastFetchTime: null,
    lastSuccessTime: null,
    totalFetched: 0,
    errorCount: 0,
    lastError: null,
    endpointUrl: 'Multi-publisher RSS syndication aggregator',
    latencyMs: null,
    note: 'Reputable publisher feeds (TechCrunch, BBC, Wired, The Hindu, etc.)',
    httpStatus: null,
    rawArticlesFetched: 0,
    validArticles: 0,
    duplicateArticles: 0,
    rejectedArticles: 0,
    insertedArticles: 0,
    nextEligibleTime: null,
  };

  getProviderStatus(): ProviderHealth {
    return { ...this.health };
  }

  updateMetrics(metrics: Partial<ProviderHealth>): void {
    Object.assign(this.health, metrics);
  }

  async fetchNews(options?: ProviderFetchOptions): Promise<NewsItem[]> {
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

  private async fetchSingleFeedXml(feed: RSSFeedConfig, signal: AbortSignal): Promise<NewsItem[]> {
    const isBrowser = typeof window !== 'undefined';

    // Endpoints in order of preference:
    // 1. Local Vite dev proxy /api/proxy (server-side fetch with no CORS)
    // 2. Direct fetch (Node.js or CORS-enabled endpoints)
    // 3. Fallback CORS proxy
    const endpointsToTry = isBrowser
      ? [
          `/api/proxy?url=${encodeURIComponent(feed.url)}`,
          feed.url,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`,
        ]
      : [feed.url];

    for (const endpoint of endpointsToTry) {
      try {
        const headers: Record<string, string> = { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' };
        if (!isBrowser) {
          headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPulse/1.0';
        }

        const res = await fetch(endpoint, { signal, headers });
        if (res.ok) {
          const xml = await res.text();
          if (xml && (xml.includes('<rss') || xml.includes('<feed') || xml.includes('<item') || xml.includes('<entry>'))) {
            const parsed = parseRssOrAtomXml(xml, feed.source, feed.defaultCategory);
            if (parsed.items.length > 0) {
              return parsed.items;
            }
          }
        }
      } catch {
        // Continue to fallback
        if (signal.aborted) break;
      }
    }

    // Fallback: try rss2json
    try {
      const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
      const res = await fetch(proxyUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.items)) {
          const items: NewsItem[] = [];
          for (const item of data.items) {
            if (!item.title || !item.link) continue;
            const now = Date.now();
            let pubDate: number | null = null;
            if (item.pubDate) {
              const parsed = new Date(item.pubDate).getTime();
              if (!isNaN(parsed) && parsed > 0) pubDate = parsed;
            }

            const cleanDesc = item.description ? item.description.replace(/<[^>]*>/g, '').trim() : item.title.trim();
            const sentimentRes = analyzeArticleSentiment({ title: item.title, description: cleanDesc });

            items.push({
              id: `rss-${pubDate || now}-${Math.random().toString(36).slice(2, 7)}`,
              title: item.title.trim(),
              description: cleanDesc,
              url: item.link,
              source: feed.source,
              author: item.author || null,
              category: feed.defaultCategory,
              sentiment: sentimentRes.sentiment,
              sentimentScore: sentimentRes.score,
              sentimentStatus: sentimentRes.status,
              sentimentModel: sentimentRes.model,
              sentimentReason: sentimentRes.reason,
              urgencyScore: 40,
              urgency: 'low',
              region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
              country: null,
              language: 'en',
              imageUrl: item.thumbnail || item.enclosure?.link || null,
              provider: 'RSS',
              timestamp: pubDate,
              fetchedAt: now,
              summary: cleanDesc,
              canonicalUrl: item.link.split('?')[0],
              contentHash: `${item.title.toLowerCase()}|${feed.source.toLowerCase()}`,
              qualityScore: 85,
              isSynthetic: false,
              origin: 'live',
            });
          }
          return items;
        }
      }
    } catch {
      // Non-fatal per-feed error isolation
    }

    return [];
  }

  private async performFetch(options?: ProviderFetchOptions): Promise<NewsItem[]> {
    const now = Date.now();
    this.health.lastFetchTime = now;
    const startTime = performance.now();

    const results: NewsItem[] = [];
    const seenUrls = new Set<string>();

    const selectedFeeds = options?.category
      ? FEEDS.filter(f => f.defaultCategory.toLowerCase() === options.category?.toLowerCase())
      : FEEDS.slice(0, 6);

    const timeoutDuration = options?.timeoutMs || 16000;

    const fetchPromises = selectedFeeds.map(async (feed) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
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

      try {
        const feedArticles = await this.fetchSingleFeedXml(feed, controller.signal);
        clearTimeout(timeout);
        if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
        return feedArticles;
      } catch {
        clearTimeout(timeout);
        if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
        return [];
      }
    });

    const feedResults = await Promise.all(fetchPromises);
    let totalRawCount = 0;

    for (const feedArticles of feedResults) {
      totalRawCount += feedArticles.length;
      for (const item of feedArticles) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          results.push(item);
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    this.health.latencyMs = durationMs;
    this.health.rawArticlesFetched = totalRawCount;
    this.health.validArticles = results.length;
    this.health.httpStatus = 200;

    if (results.length > 0) {
      this.health.status = 'Healthy';
      this.health.lastSuccessTime = now;
      this.health.totalFetched += results.length;
      this.health.lastError = null;
      this.cachedArticles = results;
    } else if (options?.signal?.aborted) {
      // Intentional cancellation: preserve status and cached items without error notice
      return this.cachedArticles;
    } else {
      this.health.errorCount++;
      this.health.status = this.cachedArticles.length > 0 ? 'Degraded' : 'Offline';
      this.health.lastError = 'RSS aggregator feeds returned 0 items or timed out';
    }

    return results.length > 0 ? results : this.cachedArticles;
  }
}
