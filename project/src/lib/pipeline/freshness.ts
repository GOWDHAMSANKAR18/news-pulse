import type { AppDataState, NewsItem } from '../../types';

export type FreshnessStatus = 'Fresh' | 'Delayed' | 'Stale' | 'Unknown';

export interface FreshnessConfig {
  pollIntervalSeconds: number; // default: 300s (5 mins) as requested in prompt
  recentLookbackMinutes: number; // default: 60m
  freshThresholdMinutes: number; // default: 60m
  delayedThresholdMinutes: number; // default: 720m (12 hours)
  cacheTtlSeconds: number; // default: 30s
}

export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  pollIntervalSeconds: 300, // 5 minutes configurable default
  recentLookbackMinutes: 60,
  freshThresholdMinutes: 60,
  delayedThresholdMinutes: 720,
  cacheTtlSeconds: 30,
};

/**
 * Strict UTC timestamp parser.
 * RULE: Do not replace missing publication timestamps with the current time.
 * Preserve missing or invalid timestamps as null/unknown and record a validation warning.
 */
export function parseToUtcTimestamp(rawDate?: string | number | null): { 
  utcTimestamp: number | null; 
  isoString: string | null; 
  isValid: boolean;
  warning?: string;
} {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return { 
      utcTimestamp: null, 
      isoString: null, 
      isValid: false,
      warning: 'Publication timestamp missing; preserved as Unknown' 
    };
  }

  if (typeof rawDate === 'number') {
    if (isNaN(rawDate) || rawDate <= 0) {
      return { 
        utcTimestamp: null, 
        isoString: null, 
        isValid: false,
        warning: 'Invalid numeric publication timestamp; preserved as Unknown' 
      };
    }
    return { 
      utcTimestamp: rawDate, 
      isoString: new Date(rawDate).toISOString(), 
      isValid: true 
    };
  }

  const parsed = new Date(rawDate).getTime();
  if (isNaN(parsed) || parsed <= 0) {
    return { 
      utcTimestamp: null, 
      isoString: null, 
      isValid: false,
      warning: `Malformed date string "${rawDate}"; preserved as Unknown` 
    };
  }

  return { 
    utcTimestamp: parsed, 
    isoString: new Date(parsed).toISOString(), 
    isValid: true 
  };
}

export function getArticleAgeMinutes(publishedAtMs: number | null | undefined, nowMs: number = Date.now()): number | null {
  if (publishedAtMs === null || publishedAtMs === undefined || isNaN(publishedAtMs) || publishedAtMs <= 0) {
    return null;
  }
  const diffMs = Math.max(0, nowMs - publishedAtMs);
  return Math.floor(diffMs / 60000);
}

export function getFreshnessClassification(
  publishedAtMs: number | null | undefined,
  freshThresholdMinutes: number = DEFAULT_FRESHNESS_CONFIG.freshThresholdMinutes,
  delayedThresholdMinutes: number = DEFAULT_FRESHNESS_CONFIG.delayedThresholdMinutes,
  nowMs: number = Date.now()
): FreshnessStatus {
  if (publishedAtMs === null || publishedAtMs === undefined || isNaN(publishedAtMs) || publishedAtMs <= 0) {
    return 'Unknown';
  }
  
  const ageMin = getArticleAgeMinutes(publishedAtMs, nowMs);
  if (ageMin === null) return 'Unknown';
  if (ageMin <= freshThresholdMinutes) return 'Fresh';
  if (ageMin <= delayedThresholdMinutes) return 'Delayed';
  return 'Stale';
}

/**
 * 5-State Data Model Classifier
 * - LIVE: recent articles successfully retrieved (within freshness threshold)
 * - STALE: previously retrieved articles exist, but freshness threshold has been exceeded
 * - HISTORICAL: older stored articles displayed because fresh articles are unavailable
 * - DEMO: sample or synthetic data is being used
 * - ERROR: required data sources failed and no usable cached data exists
 */
export function classifySystemDataState(opts: {
  articles: NewsItem[];
  lastSuccessTime: number | null;
  hasFailed: boolean;
  isDemo?: boolean;
  freshnessThresholdMinutes?: number;
  nowMs?: number;
}): AppDataState {
  const {
    articles,
    lastSuccessTime,
    hasFailed,
    isDemo = false,
    freshnessThresholdMinutes = DEFAULT_FRESHNESS_CONFIG.freshThresholdMinutes,
    nowMs = Date.now(),
  } = opts;

  if (isDemo || articles.some(a => a.isSynthetic)) {
    return 'DEMO';
  }

  if (articles.length === 0) {
    return hasFailed ? 'ERROR' : 'STALE';
  }

  // Check if we have articles with valid publication timestamp within freshness threshold
  const freshArticles = articles.filter(a => {
    if (!a.timestamp) return false;
    const age = getArticleAgeMinutes(a.timestamp, nowMs);
    return age !== null && age <= freshnessThresholdMinutes;
  });

  if (freshArticles.length > 0) {
    return 'LIVE';
  }

  // If no articles within 60m, but we have a recent successful collection within the threshold
  if (lastSuccessTime && (nowMs - lastSuccessTime) <= freshnessThresholdMinutes * 60000) {
    // If the newest article is old, classify as HISTORICAL (fresh from source is unavailable, showing history)
    const newestTimestamp = articles[0]?.timestamp;
    if (newestTimestamp && (nowMs - newestTimestamp) > freshnessThresholdMinutes * 60000) {
      return 'HISTORICAL';
    }
    return 'LIVE';
  }

  // Articles exist but all are older than threshold
  if (hasFailed || (lastSuccessTime && (nowMs - lastSuccessTime) > freshnessThresholdMinutes * 60000)) {
    return 'STALE';
  }

  return 'HISTORICAL';
}
