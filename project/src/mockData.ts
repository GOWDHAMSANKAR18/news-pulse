import type {
  Category,
  NewsItem,
  Region,
  Sentiment,
  Urgency,
  LogEntry,
  PipelineStatus,
} from './types';
import { getArticleAgeMinutes, getFreshnessClassification } from './lib/pipeline/freshness';

export const REGIONS: Region[] = [
  { id: 'delhi', name: 'Delhi NCR', lat: 28.61, lng: 77.21 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.07, lng: 72.87 },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.97, lng: 77.59 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.57, lng: 88.36 },
  { id: 'chennai', name: 'Chennai', lat: 13.08, lng: 80.27 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.38, lng: 78.48 },
];

const CATEGORIES: Category[] = ['Technology', 'Politics', 'Business', 'Sports', 'World', 'India'];
const SENTIMENTS: Sentiment[] = ['Positive', 'Neutral', 'Negative'];

const SOURCES = [
  'Reuters India',
  'PTI Wire',
  'The Wire',
  'Times Now',
  'NDTV',
  'Hindustan Times',
  'Economic Times',
  'India Today',
  'ANI',
  'BBC India',
  'The Hindu',
  'Mint',
];

const TEMPLATES: Record<string, { breaking: string[]; normal: string[] }> = {
  Technology: {
    breaking: [
      'Apple unveils next-gen AI chip at Bengaluru summit',
      'Massive cybersecurity breach hits Indian fintech giants',
      'Google opens new data centre in Hyderabad, 10k jobs expected',
      'TCS announces landmark cloud deal worth $2.4B',
      'Infosys launches agentic-AI platform for enterprise clients',
    ],
    normal: [
      'Startup founders bullish on India deep-tech funding revival',
      'Semiconductor manufacturing picks up momentum in Gujarat',
      'ISRO schedules next PSLV launch for Q4',
      'Open-source adoption surges across Indian SMEs',
      'New GPU-as-a-service pricing wars heat up among cloud providers',
    ],
  },
  Politics: {
    breaking: [
      'Parliament passes controversial data-protection bill',
      'Cabinet reshuffle announced, 6 new ministers sworn in',
      'EC declares dates for upcoming state assembly elections',
      'Major opposition alliance splits ahead of polls',
      'Supreme Court reserves verdict on electoral bond scheme',
    ],
    normal: [
      'PM addresses diaspora in Singapore, touts economic reforms',
      'Opposition walks out of Lok Sabha over fuel pricing',
      'State cabinet approves new industrial corridor plan',
      'Diplomatic talks continue with delegation from Germany',
      'Policy think-tank proposes revised GST slab structure',
    ],
  },
};

const KEYWORDS = [
  'parliament', 'election', 'markets', 'sensex', 'rupee', 'ai', 'cybersecurity',
  'semiconductor', 'cricket', 'kohli', 'chopra', 'rbi', 'ipo', 'budget',
  'startup', 'cloud', 'gpu', 'green-energy', 'kabaddi', 'chess',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function urgencyFromScore(score: number): Urgency {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

let idCounter = 0;

export function generateNewsItem(breaking = false): NewsItem {
  const category = pick(CATEGORIES);
  const templates = TEMPLATES[category] || TEMPLATES.Technology;
  const title = breaking ? pick(templates.breaking) : pick(templates.normal);
  const region = pick(REGIONS);
  const sentiment = pick(SENTIMENTS);
  const urgencyScore = breaking
    ? 70 + Math.floor(Math.random() * 30)
    : Math.floor(Math.random() * 75) + 5;
  const now = Date.now();
  const pubDate = now - Math.floor(Math.random() * 1800000); // 0-30 min ago
  const source = pick(SOURCES);

  return {
    id: `news-${idCounter++}`,
    title,
    description: 'Auto-extracted summary from RSS feed batch processed through NLP pipeline.',
    url: `https://news.publisher.example/article-${idCounter}`,
    source,
    author: null,
    category,
    sentiment,
    sentimentScore: sentiment === 'Positive' ? 0.6 : sentiment === 'Negative' ? -0.6 : 0,
    urgencyScore,
    urgency: urgencyFromScore(urgencyScore),
    region,
    country: 'India',
    language: 'en',
    imageUrl: null,
    provider: 'RSS',
    timestamp: pubDate,
    fetchedAt: now,
    summary: 'Auto-extracted summary from RSS feed batch processed through NLP pipeline.',
    canonicalUrl: `https://news.publisher.example/article-${idCounter}`,
    contentHash: `${title.toLowerCase()}|${source.toLowerCase()}`,
    qualityScore: 85,
    isSynthetic: false,
    freshnessStatus: getFreshnessClassification(pubDate),
    ageMinutes: getArticleAgeMinutes(pubDate),
  };
}

export function generateBatch(count: number): NewsItem[] {
  return Array.from({ length: count }, () =>
    generateNewsItem(Math.random() < 0.15),
  );
}

export function generateIngestionHistory(points: number): { label: string; count: number }[] {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (points - 1 - i) * 60000);
    return {
      label: t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      count: 40 + Math.floor(Math.random() * 60) + (i > points - 5 ? 20 : 0),
    };
  });
}

export function generateKeywordCounts(top: number): { keyword: string; count: number }[] {
  const shuffled = [...KEYWORDS].sort(() => Math.random() - 0.5);
  return shuffled
    .slice(0, top)
    .map((keyword) => ({
      keyword,
      count: Math.floor(Math.random() * 900) + 100,
    }))
    .sort((a, b) => b.count - a.count);
}

export function generateLogEntry(): LogEntry {
  const level = pick<LogEntry['level']>(['INFO', 'INFO', 'INFO', 'WARN', 'INFO', 'ERROR']);
  const sources = ['kafka-consumer-01', 'spark-stream-02', 'rss-ingester', 'nlp-worker-03', 'scheduler'];
  const source = pick(sources);
  const messages: Record<LogEntry['level'], string[]> = {
    INFO: [
      'Batch processed: 128 articles in 4.2s',
      'RSS source synced: timesofindia.indiatimes.com',
      'NLP enrichment completed for batch #4821',
      'Sentiment classification model warmed up',
      'New Kafka partition assigned to consumer group',
      'Offloaded 64 events to downstream sink',
      'Topic partition rebalance complete',
    ],
    WARN: [
      'RSS source responded slowly (2.1s): hindu.com',
      'Kafka lag detected on topic news-events: 340 msgs',
      'Duplicate article hash filtered, skipping',
      'GPU memory at 78%, consider scaling workers',
    ],
    ERROR: [
      'Failed to fetch RSS feed: economic.com (HTTP 503)',
      'Spark executor lost, task retried on node-04',
      'Schema validation failed for 2 records, quarantined',
    ],
  };
  return {
    id: `log-${idCounter++}`,
    timestamp: Date.now(),
    level,
    source,
    message: pick(messages[level]),
  };
}

export function initialPipelineStatus(): PipelineStatus {
  const now = Date.now();
  return {
    kafka: 'Degraded',
    spark: 'Degraded',
    latencyMs: 0,
    totalIngested: 0,
    activeSources: 0,
    throughputPerMin: 0,
    lastRunTimestamp: now,
    lastSuccessCollectionTime: now,
    newestArticleTimestamp: now,
    recordsLastRun: 0,
    duplicatesRemovedLastRun: 0,
    rejectedLastRun: 0,
    freshnessBreakdown: {
      fresh: 0,
      delayed: 0,
      stale: 0,
    },
  };
}
