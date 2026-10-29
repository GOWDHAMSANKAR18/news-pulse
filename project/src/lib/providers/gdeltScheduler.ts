/**
 * Centralized GDELT Request Scheduler & Rate-Limit Controller
 * 
 * Enforces:
 * 1. Single active in-flight request at any time across the application instance.
 * 2. Proper inter-request pacing (minimum 5.5-6.0 seconds between outbound requests)
 *    WITHOUT falsely treating normal pacing as an HTTP 429 rate limit.
 * 3. Strict separation of upstream HTTP 429 rate-limit cooldown from standard pacing.
 * 4. Graceful handling of intentional request cancellations (React StrictMode remounts,
 *    tab switching, component unmounting) without recording false provider outages.
 * 5. Query TTL caching to eliminate redundant requests for identical topics.
 * 6. Cross-tab and multi-caller rate-limit synchronization via storage events.
 * 7. Full HTTP 429 Retry-After header parsing (seconds or HTTP date).
 * 8. Configurable exponential backoff with jitter on repeated 429s.
 * 9. Comprehensive structured diagnostics telemetry.
 */

import type { NewsItem } from '../../types';

export interface GDELTSchedulerConfig {
  minIntervalMs: number;
  defaultCooldownMs: number;
  maxCooldownMs: number;
  queryTtlMs: number;
  maxRetries: number;
  jitterMaxMs: number;
}

export type GDELTRequestStatus = 
  | 'SUCCESS' 
  | 'CACHE_HIT' 
  | 'RATE_LIMITED' 
  | 'COOLDOWN_ACTIVE' 
  | 'TIMEOUT' 
  | 'CANCELLED' 
  | 'NETWORK_ERROR' 
  | 'HTTP_ERROR';

export interface GDELTDiagnosticEntry {
  id: string;
  timestamp: number;
  query: string;
  durationMs: number;
  httpStatus: number | null;
  fromCache: boolean;
  backoffAttempt: number;
  cooldownDurationMs: number;
  nextEligibleTime: number | null;
  retryAfterSeconds: number;
  articlesReturned: number;
  status: GDELTRequestStatus;
  cancellationReason?: 'unmount' | 'timeout' | 'user' | null;
  message: string;
}

export interface GDELTSchedulerStatus {
  isRateLimited: boolean;
  activeRequests: number;
  rateLimitCooldownUntil: number | null;
  retryAfterSecondsRemaining: number;
  backoffAttempt: number;
  totalRequestsExecuted: number;
  totalCacheHits: number;
  total429sEncountered: number;
  totalTimeouts: number;
  totalCancellations: number;
  lastRequestTime: number | null;
  lastSuccessTime: number | null;
  lastError: string | null;
}

const DEFAULT_CONFIG: GDELTSchedulerConfig = {
  minIntervalMs: 5500,        // 5.5s minimum gap between outbound GDELT calls
  defaultCooldownMs: 8000,    // 8.0s default cooldown on 429 when Retry-After is absent
  maxCooldownMs: 120000,      // Max backoff capped at 2 minutes
  queryTtlMs: 300000,         // 5 minutes query cache TTL
  maxRetries: 1,              // Bounded retries
  jitterMaxMs: 1000,          // Up to 1s randomized jitter
};

const STORAGE_SYNC_KEY = 'newspulse_gdelt_scheduler_sync';

export class GDELTScheduler {
  private config: GDELTSchedulerConfig;
  private inFlightPromise: Promise<GDELTFetchResult> | null = null;
  private inFlightQueryKey: string | null = null;
  private inFlightRequests: Map<string, Promise<GDELTFetchResult>> = new Map();
  private queryCache: Map<string, { timestamp: number; items: NewsItem[] }> = new Map();
  private diagnosticsLog: GDELTDiagnosticEntry[] = [];
  private maxDiagnosticsEntries = 50;

  // Rate-limiting and pacing state
  private lastRequestStartTime = 0;
  private rateLimitCooldownUntil: number | null = null;
  private isRateLimited = false;
  private backoffAttempt = 0;
  private totalRequests = 0;
  private totalCacheHits = 0;
  private total429s = 0;
  private totalTimeouts = 0;
  private totalCancellations = 0;
  private lastSuccessTime: number | null = null;
  private lastError: string | null = null;
  private lastCachedArticles: NewsItem[] = [];

  constructor(customConfig?: Partial<GDELTSchedulerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };
    this.initStorageListener();
    this.hydrateFromStorage();
  }

  private initStorageListener(): void {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_SYNC_KEY && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data.rateLimitCooldownUntil && data.rateLimitCooldownUntil > (this.rateLimitCooldownUntil || 0)) {
              this.rateLimitCooldownUntil = data.rateLimitCooldownUntil;
              this.isRateLimited = Boolean(data.isRateLimited);
              this.backoffAttempt = data.backoffAttempt || this.backoffAttempt;
            }
          } catch {
            // Ignore parse failures
          }
        }
      });
    }
  }

  private syncToStorage(): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify({
          rateLimitCooldownUntil: this.rateLimitCooldownUntil,
          isRateLimited: this.isRateLimited,
          backoffAttempt: this.backoffAttempt,
          updatedAt: Date.now(),
        }));
      } catch {
        // Storage quota protection
      }
    }
  }

  private hydrateFromStorage(): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_SYNC_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          const now = Date.now();
          if (data.rateLimitCooldownUntil && data.rateLimitCooldownUntil > now) {
            this.rateLimitCooldownUntil = data.rateLimitCooldownUntil;
            this.isRateLimited = Boolean(data.isRateLimited);
            this.backoffAttempt = Number(data.backoffAttempt) || 0;
          }
        }
      } catch {
        // Ignore parse failures
      }
    }
  }

  /**
   * Parse Retry-After header:
   * Can be either integer seconds (e.g. "12") or an HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
   */
  public parseRetryAfterHeader(headerValue: string | null | undefined): number | null {
    if (!headerValue) return null;
    const trimmed = headerValue.trim();
    if (!trimmed) return null;

    // Check if integer seconds
    const seconds = parseInt(trimmed, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    // Check if HTTP-date format
    const parsedDate = Date.parse(trimmed);
    if (!isNaN(parsedDate)) {
      const diffMs = parsedDate - Date.now();
      return Math.max(1000, diffMs);
    }

    return null;
  }

  /**
   * Computes the next cooldown duration using exponential backoff with jitter
   */
  public calculateBackoffDelay(retryAfterMs?: number | null): number {
    if (retryAfterMs && retryAfterMs > 0) {
      // Respect upstream header explicitly with a small safety margin
      return Math.min(this.config.maxCooldownMs, Math.max(this.config.minIntervalMs, retryAfterMs + 500));
    }

    // Exponential backoff: base * 2^(attempt-1) + jitter
    const exponent = Math.max(0, Math.min(this.backoffAttempt - 1, 5));
    const base = this.config.defaultCooldownMs * Math.pow(2, exponent);
    const jitter = Math.floor(Math.random() * this.config.jitterMaxMs);
    const delay = Math.min(this.config.maxCooldownMs, base + jitter);
    return delay;
  }

  /**
   * Check seconds remaining in the upstream HTTP 429 rate limit cooldown
   */
  public getSecondsUntilEligible(): number {
    if (!this.rateLimitCooldownUntil) return 0;
    const diffMs = this.rateLimitCooldownUntil - Date.now();
    return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
  }

  /**
   * Current snapshot of scheduler health & telemetry
   */
  public getSchedulerStatus(): GDELTSchedulerStatus {
    const remaining = this.getSecondsUntilEligible();
    return {
      isRateLimited: this.isRateLimited && remaining > 0,
      activeRequests: this.inFlightPromise ? 1 : 0,
      rateLimitCooldownUntil: this.rateLimitCooldownUntil,
      retryAfterSecondsRemaining: remaining,
      backoffAttempt: this.backoffAttempt,
      totalRequestsExecuted: this.totalRequests,
      totalCacheHits: this.totalCacheHits,
      total429sEncountered: this.total429s,
      totalTimeouts: this.totalTimeouts,
      totalCancellations: this.totalCancellations,
      lastRequestTime: this.lastRequestStartTime > 0 ? this.lastRequestStartTime : null,
      lastSuccessTime: this.lastSuccessTime,
      lastError: this.lastError,
    };
  }

  /**
   * Diagnostic log getter
   */
  public getDiagnostics(): GDELTDiagnosticEntry[] {
    return [...this.diagnosticsLog];
  }

  private addDiagnostic(entry: Omit<GDELTDiagnosticEntry, 'id'>): void {
    const fullEntry: GDELTDiagnosticEntry = {
      id: `gdelt-diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...entry,
    };
    this.diagnosticsLog.unshift(fullEntry);
    if (this.diagnosticsLog.length > this.maxDiagnosticsEntries) {
      this.diagnosticsLog.length = this.maxDiagnosticsEntries;
    }
  }

  /**
   * Manually prime or reset cache (useful for tests)
   */
  public resetScheduler(): void {
    this.inFlightPromise = null;
    this.inFlightQueryKey = null;
    this.inFlightRequests.clear();
    this.queryCache.clear();
    this.diagnosticsLog = [];
    this.lastRequestStartTime = 0;
    this.rateLimitCooldownUntil = null;
    this.isRateLimited = false;
    this.backoffAttempt = 0;
    this.totalRequests = 0;
    this.totalCacheHits = 0;
    this.total429s = 0;
    this.totalTimeouts = 0;
    this.totalCancellations = 0;
    this.lastSuccessTime = null;
    this.lastError = null;
    this.lastCachedArticles = [];
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_SYNC_KEY);
      } catch {
        // Ignore
      }
    }
  }

  private queueLock: Promise<unknown> = Promise.resolve();

  /**
   * Central coordinator for all GDELT requests
   */
  public async scheduleFetch(
    queryKey: string,
    fetchExecutor: () => Promise<GDELTNetworkResult>,
    options?: { signal?: AbortSignal; bypassCache?: boolean }
  ): Promise<GDELTFetchResult> {
    const now = Date.now();

    // 0. If caller signal is ALREADY aborted before starting, exit cleanly without error log
    if (options?.signal?.aborted) {
      this.totalCancellations++;
      return {
        success: false,
        items: this.lastCachedArticles,
        fromCache: false,
        httpStatus: null,
        cooldownActive: false,
        retryAfterSeconds: 0,
        isCancelled: true,
        error: null, // Do not propagate error for intentional pre-abort
      };
    }

    // 1. Check TTL Cache first (if not bypassed)
    if (!options?.bypassCache) {
      const cached = this.queryCache.get(queryKey);
      if (cached && now - cached.timestamp < this.config.queryTtlMs) {
        this.totalCacheHits++;
        this.addDiagnostic({
          timestamp: now,
          query: queryKey,
          durationMs: 0,
          httpStatus: 200,
          fromCache: true,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: this.getSecondsUntilEligible(),
          articlesReturned: cached.items.length,
          status: 'CACHE_HIT',
          message: `Served ${cached.items.length} articles from 5-min TTL cache`,
        });
        return {
          success: true,
          items: cached.items,
          fromCache: true,
          httpStatus: 200,
          cooldownActive: false,
          retryAfterSeconds: 0,
        };
      }
    }

    // 2. Active Upstream HTTP 429 Cooldown Check — Gating
    // (Only triggers if GDELT actually returned 429, NOT for normal inter-request pacing)
    const rateLimitSecondsRemaining = this.getSecondsUntilEligible();
    if (rateLimitSecondsRemaining > 0) {
      const msg = `Rate limit active — retry after ${rateLimitSecondsRemaining}s`;
      this.lastError = msg;
      this.addDiagnostic({
        timestamp: now,
        query: queryKey,
        durationMs: 0,
        httpStatus: 429,
        fromCache: false,
        backoffAttempt: this.backoffAttempt,
        cooldownDurationMs: (this.rateLimitCooldownUntil || now) - now,
        nextEligibleTime: this.rateLimitCooldownUntil,
        retryAfterSeconds: rateLimitSecondsRemaining,
        articlesReturned: this.lastCachedArticles.length,
        status: 'COOLDOWN_ACTIVE',
        message: msg,
      });

      return {
        success: false,
        items: this.lastCachedArticles,
        fromCache: false,
        httpStatus: 429,
        cooldownActive: true,
        retryAfterSeconds: rateLimitSecondsRemaining,
        error: msg,
      };
    }

    // 3. Single-flight Coalescing: If an identical query is already queued or in flight, reuse its promise
    const activeSingleFlight = this.inFlightRequests.get(queryKey);
    if (activeSingleFlight) {
      return activeSingleFlight;
    }

    // 4. Strict FIFO Serialized Execution Lock (At most ONE active request across all callers)
    const fetchOperation = (async (): Promise<GDELTFetchResult> => {
      const previousLock = this.queueLock;
      let releaseCurrentLock: () => void = () => {};
      this.queueLock = new Promise<void>(resolve => { releaseCurrentLock = resolve; });

      await previousLock;

      try {
        // Re-check cancellation after gaining the lock
        if (options?.signal?.aborted) {
          this.totalCancellations++;
          return {
            success: false,
            items: this.lastCachedArticles,
            fromCache: false,
            httpStatus: null,
            cooldownActive: false,
            retryAfterSeconds: 0,
            isCancelled: true,
            error: null,
          };
        }

        // Re-check cache after gaining the lock (sibling may have just populated it)
        if (!options?.bypassCache) {
          const cached = this.queryCache.get(queryKey);
          if (cached && Date.now() - cached.timestamp < this.config.queryTtlMs) {
            this.totalCacheHits++;
            return {
              success: true,
              items: cached.items,
              fromCache: true,
              httpStatus: 200,
              cooldownActive: false,
              retryAfterSeconds: 0,
            };
          }
        }

        const postLockRateLimitRemaining = this.getSecondsUntilEligible();
        if (postLockRateLimitRemaining > 0) {
          return {
            success: false,
            items: this.lastCachedArticles,
            fromCache: false,
            httpStatus: 429,
            cooldownActive: true,
            retryAfterSeconds: postLockRateLimitRemaining,
            error: `Rate limit active — retry after ${postLockRateLimitRemaining}s`,
          };
        }

        // Enforce inter-request pacing from previous outbound request start
        const elapsedSinceLastStart = Date.now() - this.lastRequestStartTime;
        if (elapsedSinceLastStart < this.config.minIntervalMs) {
          const requiredSpacing = this.config.minIntervalMs - elapsedSinceLastStart;
          await new Promise(r => setTimeout(r, requiredSpacing));
          
          if (options?.signal?.aborted) {
            this.totalCancellations++;
            return {
              success: false,
              items: this.lastCachedArticles,
              fromCache: false,
              httpStatus: null,
              cooldownActive: false,
              retryAfterSeconds: 0,
              isCancelled: true,
              error: null,
            };
          }
        }

        this.inFlightQueryKey = queryKey;
        this.inFlightPromise = this.executeNetworkFetch(queryKey, fetchExecutor, options?.signal);
        return await this.inFlightPromise;
      } finally {
        this.inFlightPromise = null;
        this.inFlightQueryKey = null;
        this.inFlightRequests.delete(queryKey);
        releaseCurrentLock!();
      }
    })();

    this.inFlightRequests.set(queryKey, fetchOperation);
    return fetchOperation;
  }

  private async executeNetworkFetch(
    queryKey: string,
    fetchExecutor: () => Promise<GDELTNetworkResult>,
    signal?: AbortSignal
  ): Promise<GDELTFetchResult> {
    const startTime = performance.now();
    this.lastRequestStartTime = Date.now();
    this.totalRequests++;

    if (signal?.aborted) {
      this.totalCancellations++;
      return {
        success: false,
        items: this.lastCachedArticles,
        fromCache: false,
        httpStatus: null,
        cooldownActive: false,
        retryAfterSeconds: 0,
        isCancelled: true,
        error: null,
      };
    }

    try {
      const result = await fetchExecutor();
      const durationMs = Math.round(performance.now() - startTime);

      // Handle intentional cancellation signaled by executor
      if (result.isCancelled) {
        this.totalCancellations++;
        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: null,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: this.getSecondsUntilEligible(),
          articlesReturned: this.lastCachedArticles.length,
          status: 'CANCELLED',
          cancellationReason: 'unmount',
          message: 'Request intentionally cancelled on component unmount or client refresh',
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: null,
          cooldownActive: false,
          retryAfterSeconds: 0,
          isCancelled: true,
          error: null, // Clear error for intentional cancellations
        };
      }

      // Handle genuine request timeout
      if (result.isTimedOut) {
        this.totalTimeouts++;
        const errorMsg = `GDELT connection timed out after ${durationMs}ms`;
        this.lastError = errorMsg;

        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: null,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: 0,
          articlesReturned: 0,
          status: 'TIMEOUT',
          cancellationReason: 'timeout',
          message: errorMsg,
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: null,
          cooldownActive: false,
          retryAfterSeconds: 0,
          error: errorMsg,
        };
      }

      // Handle HTTP 429 or text rate limit notice
      if (result.httpStatus === 429 || result.isRateLimitNotice) {
        this.total429s++;
        this.isRateLimited = true;
        this.backoffAttempt++;

        // Parse Retry-After header or calculate exponential backoff
        const retryAfterMs = this.parseRetryAfterHeader(result.retryAfterHeader);
        const cooldownMs = this.calculateBackoffDelay(retryAfterMs);
        this.rateLimitCooldownUntil = Date.now() + cooldownMs;
        this.syncToStorage();

        const retryAfterSec = Math.ceil(cooldownMs / 1000);
        const errorMsg = `GDELT Rate Limit (HTTP 429): retry after ${retryAfterSec}s (attempt ${this.backoffAttempt})`;
        this.lastError = errorMsg;

        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: 429,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: cooldownMs,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: retryAfterSec,
          articlesReturned: 0,
          status: 'RATE_LIMITED',
          message: errorMsg,
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: 429,
          cooldownActive: true,
          retryAfterSeconds: retryAfterSec,
          error: errorMsg,
        };
      }

      // Handle other non-200 responses
      if (result.httpStatus && (result.httpStatus < 200 || result.httpStatus >= 300)) {
        const errorMsg = `GDELT HTTP ${result.httpStatus}: ${result.statusText || 'Error'}`;
        this.lastError = errorMsg;

        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: result.httpStatus,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: 0,
          articlesReturned: 0,
          status: 'HTTP_ERROR',
          message: errorMsg,
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: result.httpStatus,
          cooldownActive: false,
          retryAfterSeconds: 0,
          error: errorMsg,
        };
      }

      // Handle malformed payload / non-successful statusText
      if (result.statusText && (result.statusText.includes('Malformed') || result.statusText.includes('Error'))) {
        const errorMsg = `GDELT ${result.statusText}`;
        this.lastError = errorMsg;
        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: result.httpStatus || 200,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: 0,
          articlesReturned: 0,
          status: 'HTTP_ERROR',
          message: errorMsg,
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: result.httpStatus || 200,
          cooldownActive: false,
          retryAfterSeconds: 0,
          error: errorMsg,
        };
      }

      // Verified Success!
      this.isRateLimited = false;
      this.rateLimitCooldownUntil = null;
      this.backoffAttempt = 0; // Reset backoff on verified success
      this.lastSuccessTime = Date.now();
      this.lastError = null;
      this.syncToStorage();

      const items = result.items || [];
      if (items.length > 0) {
        this.lastCachedArticles = items;
        this.queryCache.set(queryKey, { timestamp: Date.now(), items });
      }

      this.addDiagnostic({
        timestamp: Date.now(),
        query: queryKey,
        durationMs,
        httpStatus: 200,
        fromCache: false,
        backoffAttempt: 0,
        cooldownDurationMs: 0,
        nextEligibleTime: null,
        retryAfterSeconds: 0,
        articlesReturned: items.length,
        status: 'SUCCESS',
        message: `Successfully retrieved ${items.length} articles from GDELT in ${durationMs}ms`,
      });

      return {
        success: true,
        items,
        fromCache: false,
        httpStatus: 200,
        cooldownActive: false,
        retryAfterSeconds: 0,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const isAbort = signal?.aborted || (err instanceof Error && err.name === 'AbortError');
      
      if (isAbort) {
        this.totalCancellations++;
        this.addDiagnostic({
          timestamp: Date.now(),
          query: queryKey,
          durationMs,
          httpStatus: null,
          fromCache: false,
          backoffAttempt: this.backoffAttempt,
          cooldownDurationMs: 0,
          nextEligibleTime: this.rateLimitCooldownUntil,
          retryAfterSeconds: this.getSecondsUntilEligible(),
          articlesReturned: this.lastCachedArticles.length,
          status: 'CANCELLED',
          cancellationReason: 'unmount',
          message: 'Request intentionally cancelled (client refresh or component unmount)',
        });

        return {
          success: false,
          items: this.lastCachedArticles,
          fromCache: false,
          httpStatus: null,
          cooldownActive: false,
          retryAfterSeconds: 0,
          isCancelled: true,
          error: null, // Do not propagate error notice for intentional cancellation
        };
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.lastError = errorMsg;

      this.addDiagnostic({
        timestamp: Date.now(),
        query: queryKey,
        durationMs,
        httpStatus: null,
        fromCache: false,
        backoffAttempt: this.backoffAttempt,
        cooldownDurationMs: 0,
        nextEligibleTime: this.rateLimitCooldownUntil,
        retryAfterSeconds: 0,
        articlesReturned: 0,
        status: 'NETWORK_ERROR',
        message: errorMsg,
      });

      return {
        success: false,
        items: this.lastCachedArticles,
        fromCache: false,
        httpStatus: null,
        cooldownActive: false,
        retryAfterSeconds: 0,
        error: errorMsg,
      };
    }
  }
}

export interface GDELTNetworkResult {
  httpStatus: number | null;
  statusText?: string;
  retryAfterHeader?: string | null;
  isRateLimitNotice?: boolean;
  isTimedOut?: boolean;
  isCancelled?: boolean;
  items?: NewsItem[];
}

export interface GDELTFetchResult {
  success: boolean;
  items: NewsItem[];
  fromCache: boolean;
  httpStatus: number | null;
  cooldownActive: boolean;
  retryAfterSeconds: number;
  isCancelled?: boolean;
  error?: string | null;
}

// Global shared scheduler singleton
export const gdeltScheduler = new GDELTScheduler();
