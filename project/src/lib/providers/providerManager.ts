import type { NewsItem, ProviderHealth } from '../../types';
import type { NewsProvider, ProviderFetchOptions } from './types';
import { GDELTProvider } from './gdeltProvider';
import { GNewsProvider } from './gnewsProvider';
import { GuardianProvider } from './guardianProvider';
import { RSSProvider } from './rssProvider';

export interface DiagnosticResult {
  provider: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  articlesRetrieved: number;
  message: string;
}

export class ProviderManager {
  private providers: NewsProvider[];
  private cache: Map<string, { timestamp: number; data: NewsItem[] }> = new Map();
  private cacheTTLMs = 30000; // 30-second bounded client cache
  private inFlightPromise: Promise<{ news: NewsItem[]; providerLogs: string[] }> | null = null;

  constructor() {
    this.providers = [
      new GDELTProvider(),
      new GNewsProvider(),
      new GuardianProvider(),
      new RSSProvider(),
    ];
  }

  getProviderStatuses(): ProviderHealth[] {
    return this.providers.map(p => p.getProviderStatus());
  }

  async fetchAllNews(options?: ProviderFetchOptions): Promise<{ news: NewsItem[]; providerLogs: string[] }> {
    // If an identical or general fetch is already in flight, reuse the promise (single-flight deduplication)
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    const cacheKey = JSON.stringify(options || {});
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
      return { news: cached.data, providerLogs: ['Loaded articles from bounded provider cache'] };
    }

    this.inFlightPromise = this.executeFetchAll(options, cacheKey);
    try {
      return await this.inFlightPromise;
    } finally {
      this.inFlightPromise = null;
    }
  }

  private async executeFetchAll(options?: ProviderFetchOptions, cacheKey?: string): Promise<{ news: NewsItem[]; providerLogs: string[] }> {
    const allArticles: NewsItem[] = [];
    const providerLogs: string[] = [];

    // Fetch from all active/configured providers concurrently with bounded timeouts
    const fetchPromises = this.providers.map(async (provider) => {
      if (!provider.isConfigured) {
        providerLogs.push(`Provider [${provider.name}] skipped (API key not configured)`);
        return [];
      }

      try {
        const items = await this.fetchWithRetry(provider, options, 0);
        if (items.length > 0) {
          providerLogs.push(`Provider [${provider.name}] fetched ${items.length} articles`);
        } else {
          const status = provider.getProviderStatus();
          providerLogs.push(`Provider [${provider.name}] returned 0 articles${status.lastError ? ` (${status.lastError})` : ''}`);
        }
        return items;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        providerLogs.push(`Provider [${provider.name}] failed: ${errMsg}`);
        return [];
      }
    });

    const settledResults = await Promise.allSettled(fetchPromises);
    for (const res of settledResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        allArticles.push(...res.value);
      }
    }

    if (allArticles.length > 0) {
      if (cacheKey) this.cache.set(cacheKey, { timestamp: Date.now(), data: allArticles });
      this.cache.set('last_successful', { timestamp: Date.now(), data: allArticles });
    }

    return { news: allArticles, providerLogs };
  }

  private async fetchWithRetry(provider: NewsProvider, options?: ProviderFetchOptions, retries = 1): Promise<NewsItem[]> {
    let attempt = 0;
    let delay = 600;
    while (attempt <= retries) {
      try {
        const items = await provider.fetchNews(options);
        return items;
      } catch (err) {
        if (attempt === retries) throw err;
      }
      attempt++;
      // Exponential backoff with jitter
      const jitter = Math.floor(Math.random() * 200);
      await new Promise(r => setTimeout(r, delay + jitter));
      delay *= 2;
    }
    return [];
  }

  updateProviderMetrics(metrics: Record<string, Partial<ProviderHealth>>) {
    for (const provider of this.providers) {
      const m = metrics[provider.name];
      if (m && typeof provider.updateMetrics === 'function') {
        provider.updateMetrics(m);
      }
    }
  }

  /**
   * Run live bounded diagnostic checks across all providers
   */
  async runDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    for (const provider of this.providers) {
      const startTime = performance.now();
      try {
        if (!provider.isConfigured) {
          const health = provider.getProviderStatus();
          results.push({
            provider: provider.name,
            status: 'OFFLINE',
            latencyMs: 0,
            articlesRetrieved: 0,
            message: health.lastError || 'Provider not configured or requires API key',
          });
          continue;
        }

        const items = await provider.fetchNews({ limit: 5 });
        const latencyMs = Math.round(performance.now() - startTime);
        const health = provider.getProviderStatus();

        if (items.length > 0) {
          results.push({
            provider: provider.name,
            status: 'ONLINE',
            latencyMs,
            articlesRetrieved: items.length,
            message: `Retrieved ${items.length} sample articles in ${latencyMs}ms`,
          });
        } else if (health.status === 'Rate Limited') {
          results.push({
            provider: provider.name,
            status: 'DEGRADED',
            latencyMs,
            articlesRetrieved: 0,
            message: health.lastError || 'Rate limit active. In cooldown.',
          });
        } else if (health.status === 'Fetched Zero Articles') {
          results.push({
            provider: provider.name,
            status: 'DEGRADED',
            latencyMs,
            articlesRetrieved: 0,
            message: 'Query succeeded (HTTP 200) but returned 0 articles',
          });
        } else {
          results.push({
            provider: provider.name,
            status: health.status === 'Offline' ? 'OFFLINE' : 'DEGRADED',
            latencyMs,
            articlesRetrieved: 0,
            message: health.lastError || 'No articles returned',
          });
        }
      } catch (err) {
        const latencyMs = Math.round(performance.now() - startTime);
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          provider: provider.name,
          status: 'OFFLINE',
          latencyMs,
          articlesRetrieved: 0,
          message: errMsg,
        });
      }
    }

    return results;
  }
}

export const providerManager = new ProviderManager();
