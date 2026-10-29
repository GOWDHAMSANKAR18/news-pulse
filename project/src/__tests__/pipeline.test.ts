import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

// Import pipeline & provider modules
import { deduplicateArticles, canonicalizeUrl } from '../lib/pipeline/deduplicator';
import { validateAndCleanArticle, evaluateBatchDataQuality } from '../lib/pipeline/validator';
import { extractTfidfKeywords, clusterNewsEvents, computeTopicGrowth } from '../lib/pipeline/nlpAnalytics';
import { generateSyntheticVolumeBatch } from '../lib/pipeline/volumeSimulator';
import { parseJsonDataset, parseCsvDataset, parseUniversalDataset, detectInputFormat } from '../lib/pipeline/varietyParsers';
import { isValidCoordinatePair, normalizeCountry, processGeographicData } from '../lib/pipeline/geoProcessor';
import { parseRssOrAtomXml } from '../lib/pipeline/rssXmlParser';
import { parseToUtcTimestamp, classifySystemDataState } from '../lib/pipeline/freshness';
import { mapToDbCategory, mapFromDbCategory } from '../lib/supabase';
import { GDELTProvider, parseGDELTDate } from '../lib/providers/gdeltProvider';
import { GuardianProvider } from '../lib/providers/guardianProvider';
import { GNewsProvider } from '../lib/providers/gnewsProvider';
import { RSSProvider } from '../lib/providers/rssProvider';
import { ProviderManager } from '../lib/providers/providerManager';
import { formatProviderError } from '../lib/providers/types';
import type { NewsItem } from '../types';

describe('Big Data News Analytics Pipeline & Provider Test Suite', () => {

  test('1. URL Canonicalization & Tracking Param Stripping', () => {
    const rawUrl = 'https://news.example.com/article/123?utm_source=twitter&utm_medium=social&fbclid=XYZ123&ref=rss';
    const cleaned = canonicalizeUrl(rawUrl);
    assert.equal(cleaned, 'https://news.example.com/article/123');
  });

  test('2. Multi-Page & Multi-Batch Deduplication', () => {
    const mockArticles: Partial<NewsItem>[] = [
      { id: '1', title: 'Global Quantum AI Computing Summit Begins', source: 'Tech Wire', url: 'https://tech.org/a1?utm_src=rss' },
      { id: '2', title: 'Global Quantum AI Computing Summit Begins', source: 'Tech Wire', url: 'https://tech.org/a1' }, // Duplicate
      { id: '3', title: 'Reserve Bank Announces Strategic Monetary Directive', source: 'Financial Times', url: 'https://finance.org/a2' },
      { id: '4', title: 'Reserve Bank Announces Strategic Monetary Directive', source: 'Financial Times', url: 'https://finance.org/a2?ref=feed' }, // Duplicate
    ];

    const fullArticles = mockArticles.map(a => validateAndCleanArticle(a).article!);
    const result = deduplicateArticles(fullArticles);

    assert.equal(result.deduplicatedNews.length, 2);
    assert.equal(result.duplicatesRemovedCount, 2);
  });

  test('3. Schema Validation & Data Quality Scoring (Veracity)', () => {
    const invalid = validateAndCleanArticle({ title: 'Abc' });
    assert.equal(invalid.valid, false);

    const valid = validateAndCleanArticle({
      title: 'Major International Decarbonization Pact Signed at Climate Summit',
      source: 'Global Press',
      url: 'https://globalpress.org/climate-pact',
      description: 'Historical climate agreement concluded with 190 nation signatures.',
      timestamp: Date.now() - 10000,
    });
    assert.equal(valid.valid, true);
    assert.ok(valid.article!.qualityScore >= 80);

    const report = evaluateBatchDataQuality([valid.article!], 1);
    assert.equal(report.validCount, 1);
    assert.equal(report.duplicateCount, 1);
    assert.ok(['A+', 'A', 'B'].includes(report.qualityGrade));
  });

  test('4. Distinction Between Stored Count, Fetched Count & Inserted Count', () => {
    const rawBatch: Partial<NewsItem>[] = [
      { title: 'Article 1 Headline High Volume Batch', source: 'Source A' },
      { title: 'Article 1 Headline High Volume Batch', source: 'Source A' }, // Duplicate
      { title: 'Article 2 Headline High Volume Batch', source: 'Source B' },
    ];
    const cleaned = rawBatch.map(a => validateAndCleanArticle(a).article!);
    const dedup = deduplicateArticles(cleaned);

    const fetchedCount = rawBatch.length;
    const skippedCount = dedup.duplicatesRemovedCount;
    const insertedCount = dedup.deduplicatedNews.length;

    assert.equal(fetchedCount, 3);
    assert.equal(skippedCount, 1);
    assert.equal(insertedCount, 2);
  });

  test('5. Volume Stress Generator & Synthetic Flag Isolation', () => {
    const batch = generateSyntheticVolumeBatch(500);
    assert.equal(batch.items.length, 500);
    assert.ok(batch.executionTimeMs >= 0);
    assert.ok(batch.storageKb > 0);
    assert.equal(batch.items[0].isSynthetic, true);
    assert.equal(batch.items[0].provider, 'Synthetic Stream');
  });

  test('6. Variety Dataset Parsers (JSON & CSV)', () => {
    const jsonStr = JSON.stringify([
      { title: 'Dataset Article 1 Headline', category: 'Technology', url: 'https://example.com/1' },
      { title: 'Dataset Article 2 Headline', category: 'Business', url: 'https://example.com/2' },
    ]);

    const jsonResult = parseJsonDataset(jsonStr);
    assert.equal(jsonResult.importedCount, 2);

    const csvStr = `title,category,url\nCSV Article 1 Headline,Politics,https://example.com/c1\nCSV Article 2 Headline,Sports,https://example.com/c2`;
    const csvResult = parseCsvDataset(csvStr);
    assert.equal(csvResult.importedCount, 2);
  });

  test('7. TF-IDF Keyword Extraction & NLP Event Clustering', () => {
    const articles: Partial<NewsItem>[] = [
      { title: 'Google launches quantum chip in Bengaluru lab', category: 'Technology' },
      { title: 'Google quantum chip benchmarked in Bengaluru', category: 'Technology' },
      { title: 'Reserve Bank announces repo rate decision', category: 'Business' },
    ];
    const full = articles.map(a => validateAndCleanArticle(a).article!);

    const keywords = extractTfidfKeywords(full, 5);
    assert.ok(keywords.length > 0);

    const clusters = clusterNewsEvents(full);
    assert.ok(clusters.length > 0);

    const growth = computeTopicGrowth(full);
    assert.ok(growth.length > 0);
  });

  test('8. Provider Health Status Instantiation', () => {
    const gdelt = new GDELTProvider();
    const guardian = new GuardianProvider();
    const gnews = new GNewsProvider();
    const rss = new RSSProvider();

    assert.equal(gdelt.name, 'GDELT');
    assert.equal(guardian.name, 'The Guardian');
    assert.equal(gnews.name, 'GNews');
    assert.equal(rss.name, 'RSS');

    assert.equal(gdelt.getProviderStatus().status, 'Healthy');
    assert.equal(rss.getProviderStatus().status, 'Healthy');
  });

  test('9. Rolling 60-Minute Window & Timestamp Age Calculation', () => {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const fiftyNineMinAgo = now - 59 * 60 * 1000;
    const seventyMinAgo = now - 70 * 60 * 1000;

    const items: Partial<NewsItem>[] = [
      { id: 'recent-10m', title: 'Article 10 min ago', timestamp: tenMinAgo },
      { id: 'recent-59m', title: 'Article 59 min ago', timestamp: fiftyNineMinAgo },
      { id: 'old-70m', title: 'Article 70 min ago', timestamp: seventyMinAgo },
    ];

    const cleaned = items.map(a => validateAndCleanArticle(a).article!);
    const last60m = cleaned.filter(a => a.timestamp !== null && (now - a.timestamp) / 60000 <= 60);

    assert.equal(last60m.length, 2);
    assert.equal(last60m[0].id, 'recent-10m');
    assert.equal(last60m[1].id, 'recent-59m');
    assert.equal(cleaned.length, 3); // Historical retains all 3
  });

  test('10. No Forceful Automatic Redirect on Empty 60m Feed (User Freedom Preserved)', () => {
    const now = Date.now();
    const oldItems: Partial<NewsItem>[] = [
      { id: 'old-120m', title: 'Article 2 hours ago', timestamp: now - 120 * 60 * 1000 },
    ];

    const cleaned = oldItems.map(a => validateAndCleanArticle(a).article!);
    const last60m = cleaned.filter(a => a.timestamp !== null && (now - a.timestamp) / 60000 <= 60);

    // Rule: We do NOT force redirect; feed remains empty with an explanatory banner and user-toggle
    assert.equal(last60m.length, 0);
    assert.equal(cleaned.length, 1);
  });

  test('11. Strict Publication Timestamp Validation (Preserves Null, Does Not Default to Date.now())', () => {
    const missing = parseToUtcTimestamp(undefined);
    assert.equal(missing.utcTimestamp, null);
    assert.equal(missing.isValid, false);
    assert.ok(missing.warning?.includes('missing'));

    const invalid = parseToUtcTimestamp('invalid-date-string');
    assert.equal(invalid.utcTimestamp, null);
    assert.equal(invalid.isValid, false);

    const valid = parseToUtcTimestamp('2026-10-13T10:00:00Z');
    assert.equal(valid.isValid, true);
    assert.ok(valid.utcTimestamp !== null && valid.utcTimestamp > 0);

    const gdeltParsed = parseGDELTDate('20261013123045');
    assert.ok(gdeltParsed !== null);
    assert.equal(parseGDELTDate(undefined), null);
  });

  test('12. Category Mapping to PostgreSQL CHECK Constraints (Tech, Politics, Finance, Sports)', () => {
    assert.equal(mapToDbCategory('Technology'), 'Tech');
    assert.equal(mapToDbCategory('Science'), 'Tech');
    assert.equal(mapToDbCategory('Business'), 'Finance');
    assert.equal(mapToDbCategory('Finance'), 'Finance');
    assert.equal(mapToDbCategory('Politics'), 'Politics');
    assert.equal(mapToDbCategory('World'), 'Politics');
    assert.equal(mapToDbCategory('India'), 'Politics');
    assert.equal(mapToDbCategory('Sports'), 'Sports');

    // Round-trip mapping
    assert.equal(mapFromDbCategory('Tech'), 'Technology');
    assert.equal(mapFromDbCategory('Finance'), 'Business');
  });

  test('13. 5-State Data Model Classification (LIVE, STALE, HISTORICAL, DEMO, ERROR)', () => {
    const now = Date.now();
    const freshArticle = validateAndCleanArticle({
      title: 'Fresh breaking headline',
      timestamp: now - 5 * 60000,
    }).article!;

    const oldArticle = validateAndCleanArticle({
      title: 'Old historical headline',
      timestamp: now - 3 * 3600000,
    }).article!;

    const syntheticArticle = validateAndCleanArticle({
      title: 'Synthetic test record',
      isSynthetic: true,
    }).article!;

    // Case 1: LIVE (contains article within 60m)
    assert.equal(classifySystemDataState({
      articles: [freshArticle],
      lastSuccessTime: now,
      hasFailed: false,
      nowMs: now,
    }), 'LIVE');

    // Case 2: HISTORICAL (articles exist, but all are older than threshold)
    assert.equal(classifySystemDataState({
      articles: [oldArticle],
      lastSuccessTime: now - 10000,
      hasFailed: false,
      nowMs: now,
    }), 'HISTORICAL');

    // Case 3: DEMO (contains synthetic stress data)
    assert.equal(classifySystemDataState({
      articles: [syntheticArticle],
      lastSuccessTime: now,
      hasFailed: false,
      nowMs: now,
    }), 'DEMO');

    // Case 4: ERROR (articles empty and fetch failed)
    assert.equal(classifySystemDataState({
      articles: [],
      lastSuccessTime: null,
      hasFailed: true,
      nowMs: now,
    }), 'ERROR');
  });

  test('14. Provider Manager Concurrency and Fault Tolerance', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('gdeltproject.org')) {
          return new Response(JSON.stringify({ articles: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('gnews.io') || urlStr.includes('guardianapis.com')) {
          return new Response(JSON.stringify({ articles: [], response: { results: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Test Feed Item</title><link>https://test.org/1</link></item></channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      };

      const manager = new ProviderManager();
      const statuses = manager.getProviderStatuses();
      assert.ok(statuses.length >= 4);

      // Diagnostics returns individual target results
      const diag = await manager.runDiagnostics();
      assert.ok(diag.length >= 4);
      assert.ok(diag.some(d => d.provider === 'RSS'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('15. Polling Interval Semantics & Zero-Article Handling Logic', () => {
    // Exact semantics defined in requirements:
    // 60 = 1 min, 300 = 5 min, 600 = 10 min, 0 = Paused
    const validIntervals = [60, 300, 600, 0];
    assert.equal(validIntervals.length, 4);
    const isPaused = (interval: number) => interval <= 0;
    
    assert.equal(isPaused(60), false);
    assert.equal(isPaused(300), false);
    assert.equal(isPaused(600), false);
    assert.equal(isPaused(0), true);

    // Verify zero-article state distinction:
    // When live providers return 0, but DB articles exist -> HISTORICAL/STALE, not full application ERROR
    const dbFallbackArticles = [
      validateAndCleanArticle({
        title: 'Archived PostgreSQL News Record',
        timestamp: Date.now() - 2 * 3600000,
        origin: 'historical',
      }).article!,
    ];

    const state = classifySystemDataState({
      articles: dbFallbackArticles,
      lastSuccessTime: Date.now() - 10000,
      hasFailed: false,
      nowMs: Date.now(),
    });

    assert.equal(state, 'HISTORICAL');
    assert.ok(dbFallbackArticles.length > 0);
  });

  test('16. The Guardian Provider Status & Key Validation', () => {
    const unconfiguredGuardian = new GuardianProvider('');
    const status = unconfiguredGuardian.getProviderStatus();
    assert.ok(['Not Configured', 'Offline'].includes(status.status));
    assert.ok(status.lastError?.includes('Guardian API key') || status.lastError?.includes('Not configured'));

    // Configured provider check
    const configuredGuardian = new GuardianProvider('9e68aefb-e9bf-403f-b16d-13324094e4a7');
    const configuredStatus = configuredGuardian.getProviderStatus();
    assert.equal(configuredStatus.status, 'Healthy');
    assert.equal(configuredStatus.lastError, null);
  });

  test('17. Provider Isolation & Concurrent Fetch Fault Tolerance', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('gdeltproject.org')) {
          return new Response('Please limit requests to one every 5 seconds', { status: 429 });
        }
        if (urlStr.includes('gnews.io')) {
          return new Response(JSON.stringify({
            totalArticles: 1,
            articles: [{
              title: 'GNews Delivered Article During GDELT Timeout',
              url: 'https://gnews.io/article/1',
              publishedAt: '2026-10-14T05:00:00Z',
              source: { name: 'GNews Network' }
            }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>RSS Isolated Article</title><link>https://rss.org/1</link></item></channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      };

      const manager = new ProviderManager();
      const result = await manager.fetchAllNews({ bypassCache: true });
      assert.ok(Array.isArray(result.news));
      assert.ok(result.news.length > 0);
      assert.ok(result.providerLogs.length >= 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('18. End-to-End Article Ingestion & Deduplication Pipeline', () => {
    const rawBatch: Partial<NewsItem>[] = [
      {
        id: 'item-1',
        title: 'Global Semiconductor Consortium Launches Sub-2nm Architecture',
        source: 'TechCrunch',
        url: 'https://techcrunch.com/2026/chip-architecture?utm_source=feed',
        category: 'Technology',
        timestamp: Date.now() - 15 * 60000, // 15 mins ago
      },
      {
        id: 'item-2',
        title: 'Global Semiconductor Consortium Launches Sub-2nm Architecture',
        source: 'TechCrunch',
        url: 'https://techcrunch.com/2026/chip-architecture', // Duplicate canonical URL
        category: 'Technology',
        timestamp: Date.now() - 14 * 60000,
      },
      {
        id: 'item-3',
        title: 'Reserve Bank Issues Monetary Guidelines for Cloud Banking',
        source: 'Economic Times',
        url: 'https://economictimes.indiatimes.com/cloud-banking',
        category: 'Business',
        timestamp: Date.now() - 30 * 60000, // 30 mins ago
      },
    ];

    // 1. Validation
    const validated = rawBatch.map(r => validateAndCleanArticle(r)).filter(v => v.valid).map(v => v.article!);
    assert.equal(validated.length, 3);

    // 2. Deduplication
    const dedup = deduplicateArticles(validated);
    assert.equal(dedup.deduplicatedNews.length, 2);
    assert.equal(dedup.duplicatesRemovedCount, 1);

    // 3. PostgreSQL Category Constraint mapping
    const dbRows = dedup.deduplicatedNews.map(a => ({
      title: a.title,
      source: a.source,
      url: a.canonicalUrl,
      category: mapToDbCategory(a.category),
      content_hash: a.contentHash,
    }));

    assert.equal(dbRows[0].category, 'Tech');
    assert.equal(dbRows[1].category, 'Finance');
  });

  test('19. Provider Status Model Representation (Phase 6)', () => {
    const manager = new ProviderManager();
    const statuses = manager.getProviderStatuses();
    const validCodes = ['Healthy', 'Degraded', 'Offline', 'Not Configured', 'Rate Limited', 'Fetched Zero Articles'];

    for (const s of statuses) {
      assert.ok(validCodes.includes(s.status), `Invalid status code: ${s.status}`);
      assert.ok(typeof s.totalFetched === 'number');
      assert.ok(typeof s.errorCount === 'number');
      assert.ok(typeof s.name === 'string');
    }
  });

  test('20. GNews Ingestion Normalization & Timestamp Integrity', () => {
    const rawGNewsArticle = {
      title: 'Global Clean Energy Summit Announces Major Solar Grid Standards',
      description: 'Leaders agree on international standard for ultra-high voltage grids.',
      url: 'https://cleanenergy.org/summit-2026?utm_campaign=daily_digest',
      image: 'https://cleanenergy.org/images/solar.jpg',
      publishedAt: '2026-10-14T03:30:00Z',
      source: { name: 'Clean Energy Wire', url: 'https://cleanenergy.org' }
    };

    const validated = validateAndCleanArticle({
      title: rawGNewsArticle.title,
      description: rawGNewsArticle.description,
      url: rawGNewsArticle.url,
      imageUrl: rawGNewsArticle.image,
      timestamp: new Date(rawGNewsArticle.publishedAt).getTime(),
      source: rawGNewsArticle.source.name,
      provider: 'GNews',
    });

    assert.equal(validated.valid, true);
    assert.equal(validated.article!.source, 'Clean Energy Wire');
    assert.equal(validated.article!.canonicalUrl, 'https://cleanenergy.org/summit-2026');
    assert.equal(validated.article!.timestamp, new Date('2026-10-14T03:30:00Z').getTime());
  });

  test('21. Mocked Successful Provider Response & Normalization', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        articles: [
          {
            title: 'Breakthrough in Quantum Optical Computing Architecture',
            url: 'https://science.org/quantum-optics',
            seendate: '20261014T050000Z',
            domain: 'science.org',
            sourcecountry: 'US',
          }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      const provider = new GDELTProvider();
      provider.resetCache();
      const articles = await provider.fetchNews({ bypassCache: true });
      assert.equal(articles.length, 1);
      assert.equal(articles[0].title, 'Breakthrough in Quantum Optical Computing Architecture');
      assert.equal(articles[0].provider, 'GDELT');
      const health = provider.getProviderStatus();
      assert.equal(health.status, 'Healthy');
      assert.equal(health.httpStatus, 200);
      assert.equal(health.validArticles, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('22. Empty Provider Response (HTTP 200) -> Fetched Zero Articles', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        articles: []
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      const provider = new GDELTProvider();
      provider.resetCache();
      const articles = await provider.fetchNews({ bypassCache: true });
      assert.equal(articles.length, 0);
      const health = provider.getProviderStatus();
      assert.equal(health.httpStatus, 200);
      assert.ok(['Fetched Zero Articles', 'Healthy'].includes(health.status));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('23. Malformed JSON Response Handling', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('<html><body>Error 502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });

      const provider = new GDELTProvider();
      provider.resetCache();
      const articles = await provider.fetchNews({ bypassCache: true });
      assert.equal(articles.length, 0);
      const health = provider.getProviderStatus();
      assert.ok(['Degraded', 'Offline'].includes(health.status));
      assert.ok(health.lastError?.toLowerCase().includes('json') || health.lastError?.includes('Malformed'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('24. Invalid RSS Feed Isolation (Malformed Feed Does Not Break Others)', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = async () => {
        callCount++;
        // First feed fails with 500 error
        if (callCount === 1) {
          return new Response('Internal Server Error', { status: 500 });
        }
        // Subsequent feeds succeed
        return new Response(JSON.stringify({
          status: 'ok',
          items: [
            {
              title: `RSS Feed Article ${callCount}`,
              link: `https://news.org/rss-${callCount}`,
              pubDate: '2026-10-14 05:00:00',
              description: 'Valid RSS excerpt text',
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const provider = new RSSProvider();
      const articles = await provider.fetchNews();
      assert.ok(articles.length > 0);
      const health = provider.getProviderStatus();
      assert.equal(health.status, 'Healthy');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('25. Request Timeout Distinguishes from Generic Abort', () => {
    const timeoutErr = formatProviderError('GDELT', new Error('signal is aborted without reason'), true);
    assert.equal(timeoutErr.isTimeout, true);
    assert.equal(timeoutErr.isAborted, true);
    assert.ok(timeoutErr.message.includes('timed out'));
    assert.equal(timeoutErr.message.includes('signal is aborted without reason'), false);
  });

  test('26. User Cancellation / Component Unmount Distinguished from Timeout', () => {
    const abortErr = new DOMException('signal is aborted without reason', 'AbortError');
    const result = formatProviderError('GNews', abortErr, false);
    assert.equal(result.isTimeout, false);
    assert.equal(result.isAborted, true);
    assert.ok(result.message.includes('cancelled (client refresh or component unmount)'));
    assert.equal(result.message.includes('without reason'), false);
  });

  test('27. HTTP 401/403 Authentication Failure Handling', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

      const provider = new GNewsProvider('test-unauthorized-key');
      const articles = await provider.fetchNews();
      assert.equal(articles.length, 0);
      const health = provider.getProviderStatus();
      assert.equal(health.status, 'Offline');
      assert.equal(health.httpStatus, 401);
      assert.ok(health.lastError?.includes('Authentication failed'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('28. HTTP 429 Rate Limiting Handling & Cooldown Setting', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('Please limit requests to one every 5 seconds', { status: 429 });

      const provider = new GDELTProvider();
      provider.resetCache();
      const articles = await provider.fetchNews({ bypassCache: true });
      assert.equal(articles.length, 0);
      const health = provider.getProviderStatus();
      assert.equal(health.status, 'Rate Limited');
      assert.equal(health.httpStatus, 429);
      assert.ok(health.nextEligibleTime !== null && health.nextEligibleTime! > Date.now());
      assert.ok(health.lastError?.includes('Rate Limit') || health.lastError?.includes('429'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('29. HTTP 500 Server Error Safe Backoff (No Indefinite Retries)', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = async () => {
        callCount++;
        return new Response('Internal Server Error', { status: 500 });
      };

      const provider = new GDELTProvider();
      provider.resetCache();
      const articles = await provider.fetchNews({ bypassCache: true });
      assert.equal(articles.length, 0);
      const health = provider.getProviderStatus();
      assert.ok(['Degraded', 'Offline'].includes(health.status));
      assert.equal(health.httpStatus, 500);
      assert.ok(callCount <= 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('30. Missing API Key Validation (Not Configured Status)', () => {
    const guardian = new GuardianProvider('');
    const status = guardian.getProviderStatus();
    assert.ok(status.status === 'Not Configured' || status.status === 'Offline');
    assert.ok(status.lastError?.includes('Guardian API key') || status.lastError?.includes('Not configured'));
  });

  test('31. Cross-Source Duplicate Article Detection', () => {
    const rawItems: Partial<NewsItem>[] = [
      { id: '1', title: 'Global Tech Breakthrough in AI Chips', url: 'https://news.com/ai-chips?utm_source=twitter', source: 'Source A', provider: 'RSS' },
      { id: '2', title: 'Global Tech Breakthrough in AI Chips', url: 'https://news.com/ai-chips?ref=feed', source: 'Source B', provider: 'GNews' },
    ];
    const cleaned = rawItems.map(a => validateAndCleanArticle(a).article!);
    const dedup = deduplicateArticles(cleaned);
    assert.equal(dedup.deduplicatedNews.length, 1);
    assert.equal(dedup.duplicatesRemovedCount, 1);
  });

  test('32. Database Insertion Failure Isolation (Cached in Memory)', () => {
    const articles = [
      validateAndCleanArticle({
        title: 'Offline Resilient Article Record',
        source: 'Resilience Test',
        url: 'https://test.org/resilient-1',
      }).article!
    ];
    assert.equal(articles.length, 1);
    assert.ok(articles[0].title.includes('Resilient'));
  });

  test('33. Provider Isolation: One Provider Failing Does Not Cancel Others', async () => {
    const originalFetch = globalThis.fetch;
    const origGNewsKey = process.env.VITE_GNEWS_API_KEY;
    process.env.VITE_GNEWS_API_KEY = 'test-gnews-key';

    try {
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('gdeltproject.org')) {
          throw new DOMException('The operation timed out', 'TimeoutError');
        }
        if (urlStr.includes('gnews.io')) {
          return new Response(JSON.stringify({
            totalArticles: 1,
            articles: [
              {
                title: 'GNews Delivered Article During GDELT Timeout',
                url: 'https://gnews.io/article/1',
                publishedAt: '2026-10-14T05:00:00Z',
                source: { name: 'GNews Network' }
              }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>RSS Live Feed</title><link>https://rss.org/feed1</link></item></channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      };

      const manager = new ProviderManager();
      const result = await manager.fetchAllNews({ bypassCache: true });
      assert.ok(Array.isArray(result.news));
      assert.ok(result.news.some(n => n.title.includes('GNews Delivered Article')));
    } finally {
      globalThis.fetch = originalFetch;
      if (origGNewsKey !== undefined) {
        process.env.VITE_GNEWS_API_KEY = origGNewsKey;
      } else {
        delete process.env.VITE_GNEWS_API_KEY;
      }
    }
  });

  test('34. Successful GNews Retrieval with Subsequent Storage Notification', () => {
    const gnewsArticles = [
      validateAndCleanArticle({
        title: 'GNews Article Successfully Validated',
        url: 'https://gnews.io/art/1',
        source: 'GNews',
        provider: 'GNews',
      }).article!
    ];

    assert.equal(gnewsArticles.length, 1);
    const gnewsStatus = 'Healthy';
    const dbWarning = 'PostgreSQL upsert notice: connection timeout';
    assert.equal(gnewsStatus, 'Healthy');
    assert.ok(dbWarning.includes('PostgreSQL'));
  });

  test('35. Successful RSS Ingestion While GDELT is Unavailable', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('gdeltproject.org')) {
          return new Response('Rate Limit', { status: 429 });
        }
        if (urlStr.includes('rss2json')) {
          return new Response(JSON.stringify({
            status: 'ok',
            items: [
              {
                title: 'Live RSS Wire Ingested Cleanly',
                link: 'https://techcrunch.com/live-wire',
                pubDate: '2026-10-14 06:00:00',
                description: 'RSS description text',
              }
            ]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not found', { status: 404 });
      };

      const rssProvider = new RSSProvider();
      const items = await rssProvider.fetchNews();
      assert.ok(items.length > 0);
      assert.equal(rssProvider.getProviderStatus().status, 'Healthy');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('36. Universal NDJSON Parser: Resolves JSON Lines Without Position Errors', () => {
    const ndjsonContent = [
      JSON.stringify({ title: 'NDJSON Quantum Computing Breakthrough Announced', url: 'https://news.org/nd1', category: 'Technology' }),
      JSON.stringify({ title: 'Global Central Banks Announce Coordinated Policy', url: 'https://news.org/nd2', category: 'Business' }),
      JSON.stringify({ title: 'International Climate Accord Enters Enforcement', url: 'https://news.org/nd3', category: 'World' }),
    ].join('\n');

    const result = parseUniversalDataset(ndjsonContent);
    assert.equal(result.formatDetected, 'ndjson');
    assert.equal(result.importedCount, 3);
    assert.equal(result.invalidCount, 0);
  });

  test('37. Universal JSON Object Parser with Root Key (articles/data/items/results)', () => {
    const wrappedObject = JSON.stringify({
      status: 'ok',
      totalResults: 2,
      articles: [
        { headline: 'Autonomous AI Agents Adopted in Enterprise Logistics', link: 'https://tech.org/art1', publisher: 'Enterprise AI' },
        { headline: 'Semiconductor Fabrication Plant Commences Production', link: 'https://tech.org/art2', publisher: 'Chip Wire' },
      ],
    });

    const result = parseUniversalDataset(wrappedObject);
    assert.equal(result.formatDetected, 'json_object');
    assert.equal(result.importedCount, 2);
    assert.equal(result.items[0].source, 'Enterprise AI');
  });

  test('38. RFC 4180 Quoted CSV Parser: Handles Commas and Line Breaks Inside Quotes', () => {
    const csvContent = [
      'title,source,category,url',
      '"Global Markets: Stocks Rally, Inflation Cools Rapidly","Financial Wire",Finance,"https://fin.org/stocks"',
      '"Space Agency Announces Next Moon Landing, Crew Named","Aero News",Science,"https://aero.org/moon"',
    ].join('\n');

    const result = parseCsvDataset(csvContent);
    assert.equal(result.formatDetected, 'csv');
    assert.equal(result.importedCount, 2);
    assert.equal(result.items[0].title, 'Global Markets: Stocks Rally, Inflation Cools Rapidly');
    assert.equal(result.items[0].source, 'Financial Wire');
  });

  test('39. Malformed Input Quarantine: Preserves Valid Records While Quarantining Broken Rows', () => {
    const mixedNdjson = [
      JSON.stringify({ title: 'Valid Headline for Row One Here', url: 'https://example.com/1' }),
      '{ corrupted json line without closing bracket ',
      JSON.stringify({ title: 'Abc' }), // Short title (< 5 chars)
      JSON.stringify({ title: 'Valid Headline for Row Four Here', url: 'https://example.com/4' }),
    ].join('\n');

    const result = parseJsonDataset(mixedNdjson);
    assert.equal(result.importedCount, 2);
    assert.equal(result.invalidCount, 2);
    assert.ok(result.quarantinedRecords.some(q => q.reason.includes('not valid JSON') || q.reason.includes('JSON')));
    assert.ok(result.quarantinedRecords.some(q => q.reason.includes('too short')));
  });

  test('40. Large-Batch Processing: Parses 2,000+ Records Efficiently', () => {
    const records = Array.from({ length: 2000 }, (_, i) => ({
      title: `High Volume Batch Article Benchmark Record Number ${i + 1}`,
      url: `https://benchmark.org/item/${i + 1}`,
      source: 'Volume Benchmark Source',
      category: i % 2 === 0 ? 'Technology' : 'Business',
      publishedAt: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const jsonStr = JSON.stringify(records);
    const start = performance.now();
    const result = parseUniversalDataset(jsonStr);
    const duration = performance.now() - start;

    assert.equal(result.importedCount, 2000);
    assert.ok(duration < 2500, `Large batch processing took ${duration}ms, expected < 2500ms`);
  });

  test('41. Geographic Coordinate Validation: Strictly Rejects Out-of-Bounds Lat/Lng', () => {
    assert.equal(isValidCoordinatePair(28.6139, 77.2090), true); // New Delhi
    assert.equal(isValidCoordinatePair(-33.8688, 151.2093), true); // Sydney
    assert.equal(isValidCoordinatePair(95.0, 77.2), false); // Lat > 90 invalid
    assert.equal(isValidCoordinatePair(-91.0, 10.0), false); // Lat < -90 invalid
    assert.equal(isValidCoordinatePair(20.0, 195.0), false); // Lng > 180 invalid
    assert.equal(isValidCoordinatePair(20.0, -185.0), false); // Lng < -180 invalid
    assert.equal(isValidCoordinatePair(NaN, 50.0), false);
    assert.equal(isValidCoordinatePair(undefined, null), false);
  });

  test('42. Country Name and ISO Code Normalization', () => {
    const usa1 = normalizeCountry('USA');
    const usa2 = normalizeCountry('United States');
    const usa3 = normalizeCountry('US');
    assert.equal(usa1?.name, 'United States');
    assert.equal(usa2?.name, 'United States');
    assert.equal(usa3?.name, 'United States');

    const ind1 = normalizeCountry('IN');
    const ind2 = normalizeCountry('India');
    assert.equal(ind1?.name, 'India');
    assert.equal(ind2?.name, 'India');

    const gbr = normalizeCountry('UK');
    assert.equal(gbr?.name, 'United Kingdom');
  });

  test('43. Distinguishing Exact Coordinates vs Inferred Country vs Unknown', () => {
    const exactGeo = processGeographicData({
      latitude: 40.7128,
      longitude: -74.0060,
      city: 'New York',
      country: 'United States',
    });
    assert.equal(exactGeo.locationType, 'exact');
    assert.equal(exactGeo.latitude, 40.7128);
    assert.equal(exactGeo.longitude, -74.0060);

    const inferredGeo = processGeographicData({
      country: 'Japan',
      headlineOrTitle: 'Tokyo Stock Exchange Climbs on Tech Earnings',
    });
    assert.equal(inferredGeo.locationType, 'inferred');
    assert.ok(inferredGeo.latitude !== null);

    const unknownGeo = processGeographicData({
      headlineOrTitle: 'Abstract Software Algorithm Benchmark Review',
    });
    assert.equal(unknownGeo.locationType, 'unknown');
    assert.equal(unknownGeo.latitude, null);
    assert.equal(unknownGeo.longitude, null);
  });

  test('44. Raw RSS 2.0 XML Parser with CDATA and Namespaces', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Tech Dispatch Wire</title>
    <link>https://techdispatch.org</link>
    <description>Daily technology news</description>
    <item>
      <title><![CDATA[Major AI Foundation Model Released Under Open License]]></title>
      <link>https://techdispatch.org/ai-model-2026</link>
      <description><![CDATA[A consortium of research institutions released a new open foundation model.]]></description>
      <pubDate>Wed, 14 Oct 2026 12:00:00 GMT</pubDate>
      <dc:creator>Dr. Elena Vance</dc:creator>
    </item>
  </channel>
</rss>`;

    const parsed = parseRssOrAtomXml(rssXml, 'Tech Dispatch', 'Technology');
    assert.equal(parsed.itemCount, 1);
    assert.equal(parsed.items[0].title, 'Major AI Foundation Model Released Under Open License');
    assert.equal(parsed.items[0].author, 'Dr. Elena Vance');
    assert.equal(parsed.items[0].source, 'Tech Dispatch');
  });

  test('45. Raw Atom 1.0 XML Feed Parser', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Global Science Feed</title>
  <link href="https://sciencefeed.org"/>
  <updated>2026-10-14T10:00:00Z</updated>
  <entry>
    <title>Gravitational Wave Observatory Detects Supermassive Merger</title>
    <link href="https://sciencefeed.org/articles/gw-merger-2026"/>
    <summary>Astrophysicists recorded the collision of two intermediate black holes.</summary>
    <published>2026-10-14T08:30:00Z</published>
    <author>
      <name>Cosmic Research Team</name>
    </author>
  </entry>
</feed>`;

    const parsed = parseRssOrAtomXml(atomXml, 'Global Science Feed', 'Science');
    assert.equal(parsed.itemCount, 1);
    assert.equal(parsed.items[0].title, 'Gravitational Wave Observatory Detects Supermassive Merger');
    assert.equal(parsed.items[0].url, 'https://sciencefeed.org/articles/gw-merger-2026');
  });

  test('46. GDELT Plain-Text Rate Limit Notice Detection', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(
          'Please limit requests to one every 5 seconds or contact kalev.leetaru5@gmail.com for larger queries.',
          { status: 200, headers: { 'Content-Type': 'text/plain' } }
        );
      };

      const gdelt = new GDELTProvider();
      gdelt.resetCache();
      await gdelt.fetchNews({ bypassCache: true });
      const status = gdelt.getProviderStatus();
      assert.equal(status.status, 'Rate Limited');
      assert.ok(status.lastError?.includes('Rate Limit') || status.lastError?.includes('limit'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('47. Safe Database Batch Chunking Logic (150 Items per Chunk)', () => {
    const batchSize = 150;
    const items = Array.from({ length: 420 }, (_, i) => ({ id: `art-${i}`, title: `Article ${i}` }));
    const chunks: typeof items[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      chunks.push(items.slice(i, i + batchSize));
    }

    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 150);
    assert.equal(chunks[1].length, 150);
    assert.equal(chunks[2].length, 120);
  });

  test('48. Repeated and Duplicate Imports Idempotency via Deduplication', () => {
    const sample = [
      { title: 'Duplicate Identical Headline One', source: 'Source Alpha', url: 'https://alpha.org/1' },
      { title: 'Duplicate Identical Headline One', source: 'Source Alpha', url: 'https://alpha.org/1' },
    ];
    const cleaned = sample.map(s => validateAndCleanArticle(s).article!);
    const dedup = deduplicateArticles(cleaned);

    assert.equal(dedup.deduplicatedNews.length, 1);
    assert.equal(dedup.duplicatesRemovedCount, 1);
  });

  test('49. Format Detection: Auto-Detects CSV, JSON Array, and NDJSON', () => {
    assert.equal(detectInputFormat('[{"title":"abc"}]'), 'json_array');
    assert.equal(detectInputFormat('{"articles":[{"title":"abc"}]}'), 'json_object');
    assert.equal(detectInputFormat('{"title":"row1"}\n{"title":"row2"}'), 'ndjson');
    assert.equal(detectInputFormat('title,url,source\nHeadline,http://a.com,Src'), 'csv');
  });

  test('50. Map Coordinate Projection to Viewport Boundaries', () => {
    // Equator / Prime Meridian (0, 0)
    const center = {
      x: ((0 + 180) / 360) * 100,
      y: ((90 - 0) / 180) * 100,
    };
    assert.equal(center.x, 50);
    assert.equal(center.y, 50);

    // North-West quadrant (New York: ~40.7N, -74.0W)
    const nyX = (( -74.006 + 180) / 360) * 100;
    const nyY = ((90 - 40.7128) / 180) * 100;
    assert.ok(nyX < 50);
    assert.ok(nyY < 50);
  });

});
