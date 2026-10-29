import type { FreshnessStatus } from './lib/pipeline/freshness';

export type Category = 
  | 'Technology' 
  | 'Politics' 
  | 'Business' 
  | 'Sports' 
  | 'World' 
  | 'India' 
  | 'Science' 
  | 'Health' 
  | 'Environment' 
  | 'Tech' 
  | 'Finance' 
  | 'General';

export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export type ProviderName = 'GDELT' | 'GNews' | 'The Guardian' | 'RSS' | 'Dataset Import' | 'Synthetic Stream';
export type ArticleOrigin = 'live' | 'historical' | 'imported' | 'synthetic';
export type AppDataState = 'LIVE' | 'STALE' | 'HISTORICAL' | 'DEMO' | 'ERROR';

export interface Region {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  author: string | null;
  category: Category;
  sentiment: Sentiment;
  sentimentScore: number; // -1.0 to 1.0
  sentimentStatus?: 'success' | 'failed' | 'pending';
  sentimentModel?: string;
  sentimentReason?: string;
  urgencyScore: number; // 0 to 100
  urgency: Urgency;
  region: Region;
  country: string | null;
  countryCode?: string | null;
  continent?: string | null;
  administrativeRegion?: string | null;
  stateCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cityName?: string | null;
  locationType?: 'exact' | 'inferred' | 'unknown';
  language: string | null;
  imageUrl: string | null;
  provider: ProviderName;
  timestamp: number | null; // UTC published_at timestamp (null if unknown)
  fetchedAt: number; // UTC fetched_at timestamp
  summary: string;
  canonicalUrl: string;
  contentHash: string;
  qualityScore: number; // 0 to 100
  isSynthetic: boolean;
  origin?: ArticleOrigin;
  freshnessStatus?: FreshnessStatus;
  ageMinutes?: number | null;
  eventClusterId?: string;
  eventClusterName?: string;
  validationWarnings?: string[];
  rawData?: Record<string, unknown>;
}

export type ProviderStatusCode = 
  | 'Healthy' 
  | 'Degraded' 
  | 'Offline' 
  | 'Not Configured' 
  | 'Rate Limited' 
  | 'Fetched Zero Articles';

export interface ProviderHealth {
  name: ProviderName;
  enabled: boolean;
  status: ProviderStatusCode;
  lastFetchTime: number | null;
  lastSuccessTime: number | null;
  totalFetched: number;
  errorCount: number;
  lastError: string | null;
  endpointUrl: string;
  latestArticleAgeMinutes?: number | null;
  latencyMs?: number | null;
  note?: string;
  httpStatus?: number | null;
  rawArticlesFetched?: number;
  validArticles?: number;
  duplicateArticles?: number;
  rejectedArticles?: number;
  insertedArticles?: number;
  nextEligibleTime?: number | null;
  retryAfterSeconds?: number | null;
  cooldownDurationMs?: number | null;
  fromCache?: boolean;
}

export interface PipelineStatus {
  kafka: 'Active' | 'Degraded' | 'Down';
  spark: 'Active' | 'Degraded' | 'Down';
  latencyMs: number;
  totalIngested: number;
  activeSources: number;
  throughputPerMin: number;
  lastRunTimestamp: number;
  lastSuccessCollectionTime: number;
  newestArticleTimestamp: number;
  recordsLastRun: number;
  duplicatesRemovedLastRun: number;
  rejectedLastRun: number;
  freshnessBreakdown: {
    fresh: number;
    delayed: number;
    stale: number;
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
}

export interface IngestionPoint {
  label: string;
  count: number;
}

export interface DataQualityReport {
  totalEvaluated: number;
  validCount: number;
  duplicateCount: number;
  malformedCount: number;
  missingFieldsCount: number;
  averageQualityScore: number;
  qualityGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  lastAuditTime: number;
}

export interface EventCluster {
  id: string;
  name: string;
  category: Category;
  articleCount: number;
  keywords: string[];
  topSources: string[];
  avgSentiment: Sentiment;
  articles: NewsItem[];
  lastUpdated: number;
}

export interface TopicGrowth {
  topic: string;
  category: Category;
  currentCount: number;
  previousCount: number;
  growthRatePct: number;
}

export interface FiveVsMetrics {
  volume: {
    totalArticles: number;
    realArticlesCount: number;
    syntheticCount: number;
    storedRecords: number;
    processedRecords: number;
    estimatedStorageKb: number;
    lastBatchExecutionMs: number;
  };
  velocity: {
    articlesPerMinute: number;
    avgLatencyMs: number;
    lastCollectionTime: number;
    lastSuccessCollectionTime: number;
    newestArticleTimestamp: number;
    timeSinceLastIngestionSec: number;
    newArticlesLastRun: number;
    pipelineStatus: 'Running' | 'Paused' | 'Degraded';
  };
  variety: {
    structuredDbRecords: number;
    semiStructuredJsonRecords: number;
    textExcerptsCount: number;
    importedDatasetCount: number;
    providerCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    languageCounts: Record<string, number>;
  };
  veracity: {
    dataQualityScore: number;
    qualityGrade: string;
    duplicatesRemovedTotal: number;
    rejectedRecordsTotal: number;
    validUrlRate: number;
    timestampNormalizationRate: number;
    sentimentConfidencePct: number;
    freshnessBreakdown: { fresh: number; delayed: number; stale: number };
  };
  value: {
    topKeywordsCount: number;
    activeEventClustersCount: number;
    sentimentRatio: { positive: number; neutral: number; negative: number };
    topPublisher: string;
    topCategory: string;
    insightsGenerated: number;
  };
}

export interface PipelineJob {
  id: string;
  provider: ProviderName;
  fetchedCount: number;
  insertedCount: number;
  skippedCount: number;
  rejectedCount: number;
  durationMs: number;
  timestamp: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errorMessage?: string;
}
