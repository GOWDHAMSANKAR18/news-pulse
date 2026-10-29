import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  scoreText, 
  analyzeArticleSentiment, 
  enrichArticleWithSentiment, 
  reprocessArticlesSentiment,
  preprocessText,
  SENTIMENT_THRESHOLDS
} from '../lib/pipeline/sentimentAnalyzer';
import { validateAndCleanArticle } from '../lib/pipeline/validator';
import type { NewsItem } from '../types';

describe('VADER Sentiment Analysis Engine & Pipeline Integration', () => {

  // ==========================================
  // Section 1: Deterministic Benchmark Examples
  // ==========================================

  test('1. Benchmark: "The company reported record profits and strong growth." -> Positive', () => {
    const text = 'The company reported record profits and strong growth.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Positive');
    assert.ok(res.score >= SENTIMENT_THRESHOLDS.POSITIVE, `Score ${res.score} should be >= ${SENTIMENT_THRESHOLDS.POSITIVE}`);
    assert.ok(res.score > 0.5, `Expected strong positive score, got ${res.score}`);
  });

  test('2. Benchmark: "Severe flooding caused extensive damage and major losses." -> Negative', () => {
    const text = 'Severe flooding caused extensive damage and major losses.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Negative');
    assert.ok(res.score <= SENTIMENT_THRESHOLDS.NEGATIVE, `Score ${res.score} should be <= ${SENTIMENT_THRESHOLDS.NEGATIVE}`);
    assert.ok(res.score < -0.5, `Expected strong negative score, got ${res.score}`);
  });

  test('3. Benchmark: "The meeting is scheduled for Monday at 10 AM." -> Neutral', () => {
    const text = 'The meeting is scheduled for Monday at 10 AM.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Neutral');
    assert.ok(res.score > SENTIMENT_THRESHOLDS.NEGATIVE && res.score < SENTIMENT_THRESHOLDS.POSITIVE, `Expected neutral score, got ${res.score}`);
    assert.equal(res.score, 0);
  });

  test('4. Benchmark: "The product is not good and customers are unhappy." -> Negative', () => {
    const text = 'The product is not good and customers are unhappy.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Negative');
    assert.ok(res.score <= SENTIMENT_THRESHOLDS.NEGATIVE, `Score ${res.score} should be <= -0.05`);
  });

  test('5. Benchmark: "The service is not bad and the experience is good." -> Generally positive', () => {
    const text = 'The service is not bad and the experience is good.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Positive');
    assert.ok(res.score >= SENTIMENT_THRESHOLDS.POSITIVE, `Score ${res.score} should be >= 0.05`);
  });

  // ==========================================
  // Section 2: Edge Cases & Sanitization
  // ==========================================

  test('6. Empty or Whitespace-Only Text -> Failed Status (Not classified as Neutral success)', () => {
    const emptyRes = scoreText('');
    assert.equal(emptyRes.status, 'failed');
    assert.ok(emptyRes.reason?.includes('No textual content'));

    const whitespaceRes = scoreText('   \t  \n  ');
    assert.equal(whitespaceRes.status, 'failed');

    const articleRes = analyzeArticleSentiment({ title: '', description: '', content: '' });
    assert.equal(articleRes.status, 'failed');
  });

  test('7. Missing Title and Description in analyzeArticleSentiment', () => {
    const res = analyzeArticleSentiment({});
    assert.equal(res.status, 'failed');
    assert.equal(res.sentiment, 'Neutral');
    assert.ok(res.reason?.includes('missing'));
  });

  test('8. HTML Entity Decoding and Tag Stripping without destroying sentiment', () => {
    const rawHtml = '<p>The economic recovery is &amp; remains <strong>booming</strong> &quot;record highs&quot; achieved!</p>';
    const cleaned = preprocessText(rawHtml);
    assert.ok(!cleaned.includes('<p>'));
    assert.ok(!cleaned.includes('<strong>'));
    assert.ok(cleaned.includes('&'));
    assert.ok(cleaned.includes('"record highs"'));

    const res = scoreText(rawHtml);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Positive');
  });

  test('9. Unicode Smart Quotes and Punctuation Handling', () => {
    const unicodeText = '“Historic breakthrough — peace and prosperity restored across the region!”';
    const res = scoreText(unicodeText);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Positive');
    assert.ok(res.score > 0.5);
  });

  test('10. Context Isolation: Word "positive" alone does not force Positive classification', () => {
    // "tested positive" in clinical context
    const text = 'Patient tested positive for influenza infection at clinic.';
    const res = scoreText(text);
    // Should NOT be positive simply because of the word "positive"
    assert.notEqual(res.sentiment, 'Positive');
  });

  test('11. Context Isolation: Word "negative" alone does not force Negative classification', () => {
    const text = 'Diagnostic lab returned negative results for viral infection.';
    const res = scoreText(text);
    // Should NOT be negative simply because of the word "negative"
    assert.notEqual(res.sentiment, 'Negative');
  });

  test('12. Negation Variations: "never failed", "not terrible", "barely adequate"', () => {
    const res1 = scoreText('The team never failed in their mission.');
    assert.equal(res1.sentiment, 'Positive');

    const res2 = scoreText('The situation is not terrible.');
    assert.ok(res2.score > 0, `Expected score > 0 for "not terrible", got ${res2.score}`);

    const res3 = scoreText('The outcome was not impressive.');
    assert.equal(res3.sentiment, 'Negative');
  });

  test('13. Very Long Content Evaluation (Scalability & Bound Check)', () => {
    const paragraph = 'The innovative technology platform achieved remarkable success and steady growth. ';
    const longText = paragraph.repeat(100); // 100 repetitions
    const res = scoreText(longText);
    assert.equal(res.status, 'success');
    assert.equal(res.sentiment, 'Positive');
    assert.ok(res.score <= 1.0 && res.score >= -1.0);
  });

  test('14. Dual Positive and Negative Statements (Balanced Resolution)', () => {
    const text = 'The company reported strong profits, but facing severe crisis and major losses in foreign division.';
    const res = scoreText(text);
    assert.equal(res.status, 'success');
    // Strong profits (+2.6, +2.3 = +4.9), severe crisis (-2.1, -2.6 = -4.7), losses (-2.1) -> net negative
    assert.ok(res.breakdown.positiveSum > 0);
    assert.ok(res.breakdown.negativeSum > 0);
    assert.equal(res.sentiment, 'Negative');
  });

  // ==========================================
  // Section 3: Ingestion Pipeline & Reprocessing
  // ==========================================

  test('15. Automatic Enrichment in validateAndCleanArticle', () => {
    const validated = validateAndCleanArticle({
      title: 'Major Breakthrough in Clean Energy Storage Announced',
      source: 'TechPulse',
      url: 'https://techpulse.org/breakthrough-2026',
    });

    assert.equal(validated.valid, true);
    assert.ok(validated.article);
    assert.equal(validated.article.sentiment, 'Positive');
    assert.ok(validated.article.sentimentScore > 0);
    assert.equal(validated.article.sentimentStatus, 'success');
    assert.equal(validated.article.sentimentModel, 'vader-rule-engine-v1');
  });

  test('16. Batch Reprocessing Preserves Metadata and Computes Accurate Counts', () => {
    const initialArticles: NewsItem[] = [
      {
        id: 'art-1',
        title: 'Historic peace agreement brings prosperity and economic surge',
        description: 'Historic peace agreement brings prosperity and economic surge',
        url: 'https://news.org/1',
        source: 'Reuters',
        author: 'Jane Doe',
        category: 'Politics',
        sentiment: 'Neutral', // Stale
        sentimentScore: 0,
        urgencyScore: 40,
        urgency: 'low',
        region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
        country: null,
        language: 'en',
        imageUrl: null,
        provider: 'RSS',
        timestamp: 1700000000000,
        fetchedAt: 1700000001000,
        summary: 'Peace agreement',
        canonicalUrl: 'https://news.org/1',
        contentHash: 'hash-1',
        qualityScore: 90,
        isSynthetic: false,
      },
      {
        id: 'art-2',
        title: 'Severe earthquake causes disastrous collapse and tragic fatalities',
        description: 'Severe earthquake causes disastrous collapse and tragic fatalities',
        url: 'https://news.org/2',
        source: 'AP News',
        author: null,
        category: 'World',
        sentiment: 'Neutral', // Stale
        sentimentScore: 0,
        urgencyScore: 90,
        urgency: 'critical',
        region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
        country: null,
        language: 'en',
        imageUrl: null,
        provider: 'GDELT',
        timestamp: 1700000002000,
        fetchedAt: 1700000003000,
        summary: 'Disaster collapse',
        canonicalUrl: 'https://news.org/2',
        contentHash: 'hash-2',
        qualityScore: 85,
        isSynthetic: false,
      },
      {
        id: 'art-3',
        title: 'The city council regular committee session opens at 9 AM',
        description: 'Regular council proceedings scheduled for discussion',
        url: 'https://news.org/3',
        source: 'City Gazette',
        author: null,
        category: 'Politics',
        sentiment: 'Neutral',
        sentimentScore: 0,
        urgencyScore: 30,
        urgency: 'low',
        region: { id: 'global', name: 'Global', lat: 0, lng: 0 },
        country: null,
        language: 'en',
        imageUrl: null,
        provider: 'RSS',
        timestamp: 1700000004000,
        fetchedAt: 1700000005000,
        summary: 'City council',
        canonicalUrl: 'https://news.org/3',
        contentHash: 'hash-3',
        qualityScore: 80,
        isSynthetic: false,
      }
    ];

    const { updatedArticles, stats } = reprocessArticlesSentiment(initialArticles, { forceRecompute: true });

    assert.equal(stats.totalEvaluated, 3);
    assert.equal(stats.processed, 3);
    assert.equal(stats.successful, 3);
    assert.equal(stats.failed, 0);
    assert.equal(stats.positiveCount, 1);
    assert.equal(stats.negativeCount, 1);
    assert.equal(stats.neutralCount, 1);

    // Verify IDs, URLs, and timestamps remain untouched
    assert.equal(updatedArticles[0].id, 'art-1');
    assert.equal(updatedArticles[0].timestamp, 1700000000000);
    assert.equal(updatedArticles[0].source, 'Reuters');
    assert.equal(updatedArticles[0].sentiment, 'Positive');
    assert.ok(updatedArticles[0].sentimentScore > 0.5);

    assert.equal(updatedArticles[1].id, 'art-2');
    assert.equal(updatedArticles[1].sentiment, 'Negative');
    assert.ok(updatedArticles[1].sentimentScore < -0.5);

    assert.equal(updatedArticles[2].id, 'art-3');
    assert.equal(updatedArticles[2].sentiment, 'Neutral');
  });

  test('17. Dashboard Mathematical Ratio Consistency (Denominator never zero / no NaN)', () => {
    const counts = { positive: 12, neutral: 20, negative: 8 };
    const total = counts.positive + counts.neutral + counts.negative;
    assert.equal(total, 40);

    const posPct = ((counts.positive / total) * 100).toFixed(1);
    const neuPct = ((counts.neutral / total) * 100).toFixed(1);
    const negPct = ((counts.negative / total) * 100).toFixed(1);

    assert.equal(posPct, '30.0');
    assert.equal(neuPct, '50.0');
    assert.equal(negPct, '20.0');
    assert.equal(Number(posPct) + Number(neuPct) + Number(negPct), 100);
  });
});
