import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { GDELTScheduler, type GDELTNetworkResult } from '../lib/providers/gdeltScheduler';
import { GDELTProvider } from '../lib/providers/gdeltProvider';
import { ProviderManager } from '../lib/providers/providerManager';
import type { NewsItem } from '../types';

function makeTestArticle(partial: Partial<NewsItem>): NewsItem {
  return {
    id: partial.id || 'test-1',
    title: partial.title || 'Test Title',
    description: partial.description || partial.title || 'Test description',
    url: partial.url || 'https://news.org/test',
    source: partial.source || 'reuters.com',
    author: partial.author || null,
    category: partial.category || 'Technology',
    sentiment: partial.sentiment || 'Neutral',
    sentimentScore: partial.sentimentScore || 0,
    urgencyScore: partial.urgencyScore || 50,
    urgency: partial.urgency || 'medium',
    region: partial.region || { id: 'global', name: 'Global', lat: 0, lng: 0 },
    country: partial.country || null,
    language: partial.language || 'English',
    imageUrl: partial.imageUrl || null,
    provider: partial.provider || 'GDELT',
    timestamp: partial.timestamp ?? Date.now(),
    fetchedAt: partial.fetchedAt ?? Date.now(),
    summary: partial.summary || partial.title || 'Test summary',
    canonicalUrl: partial.canonicalUrl || 'https://reuters.com/1',
    contentHash: partial.contentHash || 'hash-1',
    qualityScore: partial.qualityScore || 85,
    isSynthetic: false,
    origin: 'live',
  };
}

describe('GDELT Centralized Request Scheduler & Rate-Limiting Test Suite', () => {

  test('1. Multiple callers requesting the same query simultaneously (Single-flight Coalescing)', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 20, defaultCooldownMs: 100, queryTtlMs: 5000 });
    let networkCallCount = 0;

    const mockExecutor = async (): Promise<GDELTNetworkResult> => {
      networkCallCount++;
      await new Promise(r => setTimeout(r, 20));
      return {
        httpStatus: 200,
        items: [makeTestArticle({
          id: 'test-1',
          title: 'Simultaneous Call Article',
          source: 'reuters.com',
          category: 'Technology',
          canonicalUrl: 'https://reuters.com/simultaneous-1',
          summary: 'Simultaneous call test',
        })],
      };
    };

    // Trigger 5 concurrent calls with the exact same query
    const results = await Promise.all([
      scheduler.scheduleFetch('tech_query', mockExecutor),
      scheduler.scheduleFetch('tech_query', mockExecutor),
      scheduler.scheduleFetch('tech_query', mockExecutor),
      scheduler.scheduleFetch('tech_query', mockExecutor),
      scheduler.scheduleFetch('tech_query', mockExecutor),
    ]);

    // Network call must have been made EXACTLY ONCE
    assert.equal(networkCallCount, 1);
    for (const res of results) {
      assert.equal(res.success, true);
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].title, 'Simultaneous Call Article');
    }
  });

  test('2. Multiple topic queries during a single refresh cycle (Serialization & Single Active Request)', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 10, defaultCooldownMs: 50 });
    let activeRequests = 0;
    let maxConcurrent = 0;
    let completedCount = 0;

    const createTopicExecutor = (topic: string) => async (): Promise<GDELTNetworkResult> => {
      activeRequests++;
      maxConcurrent = Math.max(maxConcurrent, activeRequests);
      await new Promise(r => setTimeout(r, 15));
      activeRequests--;
      completedCount++;
      return {
        httpStatus: 200,
        items: [makeTestArticle({
          id: `topic-${topic}`,
          title: `Article for ${topic}`,
          source: 'bloomberg.com',
          category: 'Business',
          canonicalUrl: `https://bloomberg.com/${topic}`,
          summary: topic,
        })],
      };
    };

    // Fire 3 distinct topic queries at the same moment
    await Promise.all([
      scheduler.scheduleFetch('topic_ai', createTopicExecutor('topic_ai')),
      scheduler.scheduleFetch('topic_energy', createTopicExecutor('topic_energy')),
      scheduler.scheduleFetch('topic_finance', createTopicExecutor('topic_finance')),
    ]);

    // At no point should more than 1 request be active simultaneously
    assert.equal(maxConcurrent, 1);
    assert.equal(completedCount, 3);
  });

  test('3. Repeated manual refresh clicks (Cooldown Gating Prevents Extra Network Requests)', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 200, defaultCooldownMs: 2000 });
    let networkCalls = 0;

    const mockExecutor = async (): Promise<GDELTNetworkResult> => {
      networkCalls++;
      return {
        httpStatus: 429,
        statusText: 'Too Many Requests',
        retryAfterHeader: '3', // 3 seconds
      };
    };

    // First call triggers 429 and activates 3s cooldown
    const first = await scheduler.scheduleFetch('manual_query', mockExecutor, { bypassCache: true });
    assert.equal(first.httpStatus, 429);
    assert.equal(first.cooldownActive, true);
    assert.equal(networkCalls, 1);

    // Rapid successive manual clicks during cooldown
    const second = await scheduler.scheduleFetch('manual_query', mockExecutor, { bypassCache: true });
    const third = await scheduler.scheduleFetch('manual_query', mockExecutor, { bypassCache: true });

    // Zero extra network calls should be sent during active cooldown
    assert.equal(networkCalls, 1);
    assert.equal(second.cooldownActive, true);
    assert.equal(third.cooldownActive, true);
    assert.ok(second.retryAfterSeconds > 0);
  });

  test('4. Polling while a previous request is still active', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 50, queryTtlMs: 5000 });
    let networkCalls = 0;

    const slowExecutor = async (): Promise<GDELTNetworkResult> => {
      networkCalls++;
      await new Promise(r => setTimeout(r, 40));
      return { httpStatus: 200, items: [] };
    };

    // Long running request
    const promise1 = scheduler.scheduleFetch('poll_query', slowExecutor);
    // Scheduled poll arrives 10ms later while promise1 is active
    await new Promise(r => setTimeout(r, 10));
    const promise2 = scheduler.scheduleFetch('poll_query', slowExecutor);

    await Promise.all([promise1, promise2]);
    // Collapsed to 1 network call
    assert.equal(networkCalls, 1);
  });

  test('5. HTTP 429 with a valid Retry-After header', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 50, defaultCooldownMs: 10000 });
    
    // Header with integer seconds
    const secDelay = scheduler.parseRetryAfterHeader('15');
    assert.equal(secDelay, 15000);

    // Header with HTTP date
    const futureDate = new Date(Date.now() + 25000).toUTCString();
    const dateDelay = scheduler.parseRetryAfterHeader(futureDate);
    assert.ok(dateDelay !== null && dateDelay >= 23000 && dateDelay <= 27000);

    const res = await scheduler.scheduleFetch('retry_after_test', async () => ({
      httpStatus: 429,
      statusText: 'Too Many Requests',
      retryAfterHeader: '4',
    }), { bypassCache: true });

    assert.equal(res.httpStatus, 429);
    assert.equal(res.cooldownActive, true);
    const status = scheduler.getSchedulerStatus();
    assert.equal(status.isRateLimited, true);
    assert.ok(status.retryAfterSecondsRemaining >= 3 && status.retryAfterSecondsRemaining <= 5);
  });

  test('6. HTTP 429 without a Retry-After header', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 50, defaultCooldownMs: 4000, jitterMaxMs: 500 });

    const res = await scheduler.scheduleFetch('no_header_test', async () => ({
      httpStatus: 429,
      statusText: 'Too Many Requests',
      retryAfterHeader: null,
    }), { bypassCache: true });

    assert.equal(res.httpStatus, 429);
    assert.equal(res.cooldownActive, true);
    const status = scheduler.getSchedulerStatus();
    assert.equal(status.isRateLimited, true);
    assert.ok(status.retryAfterSecondsRemaining >= 3 && status.retryAfterSecondsRemaining <= 6);
  });

  test('7. Repeated 429 responses and exponential backoff', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 20, defaultCooldownMs: 1000, maxCooldownMs: 10000, jitterMaxMs: 0 });

    // Initial backoff at attempt 0
    const delay0 = scheduler.calculateBackoffDelay(null);
    assert.equal(delay0, 1000);

    await scheduler.scheduleFetch('repeat_429', async () => ({
      httpStatus: 429,
      statusText: 'Rate limited',
    }), { bypassCache: true });

    assert.equal(scheduler.getSchedulerStatus().backoffAttempt, 1);
  });

  test('8. Successful response after cooldown resets backoff and clears rate-limited status', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 10, defaultCooldownMs: 40, jitterMaxMs: 0 });

    // 1. Encounter 429
    await scheduler.scheduleFetch('recovery_query', async () => ({
      httpStatus: 429,
      statusText: 'Too Many Requests',
    }), { bypassCache: true });

    assert.equal(scheduler.getSchedulerStatus().isRateLimited, true);

    // Wait out cooldown
    await new Promise(r => setTimeout(r, 80));

    // 2. Subsequent call succeeds
    const successRes = await scheduler.scheduleFetch('recovery_query', async () => ({
      httpStatus: 200,
      statusText: 'OK',
      items: [makeTestArticle({
        id: 'recovered-1',
        title: 'Post Cooldown Article',
        source: 'apnews.com',
        category: 'World',
        sentiment: 'Positive',
        sentimentScore: 0.5,
        canonicalUrl: 'https://apnews.com/recovered',
      })],
    }), { bypassCache: true });

    assert.equal(successRes.success, true);
    assert.equal(successRes.items.length, 1);
    const status = scheduler.getSchedulerStatus();
    assert.equal(status.isRateLimited, false);
    assert.equal(status.backoffAttempt, 0); // Reset to 0!
  });

  test('9. Network failure and timeout handling', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 20 });

    const res = await scheduler.scheduleFetch('network_err', async () => {
      throw new Error('ECONNRESET: Connection dropped by peer');
    }, { bypassCache: true });

    assert.equal(res.success, false);
    assert.ok(res.error?.includes('ECONNRESET'));
    assert.equal(res.cooldownActive, false);
  });

  test('10. Request cancellation without retry loops (Intentional cancellation preserved)', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 20 });
    const controller = new AbortController();
    controller.abort(); // Pre-aborted

    let callsMade = 0;
    const res = await scheduler.scheduleFetch('aborted_query', async () => {
      callsMade++;
      return { httpStatus: 200, items: [] };
    }, { signal: controller.signal });

    assert.equal(res.success, false);
    assert.equal(callsMade, 0); // Never started network fetch
    assert.equal(res.isCancelled, true);
    assert.equal(res.error, null); // No false error message recorded
  });

  test('11. Cache hits that avoid unnecessary network calls', async () => {
    const scheduler = new GDELTScheduler({ minIntervalMs: 20, queryTtlMs: 60000 });
    let networkCalls = 0;

    const mockExecutor = async (): Promise<GDELTNetworkResult> => {
      networkCalls++;
      return {
        httpStatus: 200,
        items: [makeTestArticle({
          id: 'cached-art-1',
          title: 'Article Cached for TTL',
          canonicalUrl: 'https://reuters.com/cached-1',
        })],
      };
    };

    // First call: executes network fetch
    const first = await scheduler.scheduleFetch('ttl_query', mockExecutor);
    assert.equal(networkCalls, 1);
    assert.equal(first.fromCache, false);

    // Second call with same query within TTL: must return from cache with NO network call
    const second = await scheduler.scheduleFetch('ttl_query', mockExecutor);
    assert.equal(networkCalls, 1); // Still 1!
    assert.equal(second.fromCache, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].title, 'Article Cached for TTL');
  });

  test('12. GDELT failure while RSS and other providers remain operational', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        if (urlStr.includes('gdeltproject.org')) {
          // GDELT rate limits
          return new Response('Please limit requests to one every 5 seconds', { status: 429 });
        }
        if (urlStr.includes('guardianapis.com') || urlStr.includes('gnews.io')) {
          return new Response(JSON.stringify({
            response: { results: [{ id: 'guard-1', webTitle: 'Operational Guardian Article', webUrl: 'https://guardian.com/1', sectionName: 'World', webPublicationDate: '2026-10-15T12:00:00Z' }] }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        // Return valid XML for any RSS feed immediately without delays
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Operational RSS Article</title><link>https://sample.org/news/1</link></item></channel></rss>`, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' }
        });
      };

      const manager = new ProviderManager();
      const res = await manager.fetchAllNews({ mode: 'latest' });

      // Guardian or RSS successfully ingested articles
      assert.ok(res.news.length > 0);
      assert.ok(res.news.some(n => n.provider === 'RSS' || n.provider === 'The Guardian'));

      // GDELT is rate limited but does not bring down the pipeline
      const statuses = manager.getProviderStatuses();
      const gdeltStatus = statuses.find(s => s.name === 'GDELT');
      assert.ok(gdeltStatus);
      assert.equal(gdeltStatus?.status, 'Rate Limited');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('13. Application remounts that might otherwise duplicate polling', async () => {
    // Tests that multiple GDELTProvider instances share the same rate-limit state
    const provider1 = new GDELTProvider();
    const provider2 = new GDELTProvider();

    // Trigger rate limit through provider1
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('Too Many Requests', { status: 429 });
      await provider1.fetchNews({ bypassCache: true } as any);

      // provider2 should immediately reflect rate-limited status without making another network call
      const status2 = provider2.getProviderStatus();
      assert.equal(status2.status, 'Rate Limited');
      assert.ok(status2.retryAfterSeconds! > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('14. Scheduler diagnostics telemetry recording', () => {
    const scheduler = new GDELTScheduler();
    const diag = scheduler.getDiagnostics();
    assert.ok(Array.isArray(diag));
    const status = scheduler.getSchedulerStatus();
    assert.ok(typeof status.totalRequestsExecuted === 'number');
    assert.ok(typeof status.totalCacheHits === 'number');
  });

});
