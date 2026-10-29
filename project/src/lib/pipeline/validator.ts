import type { NewsItem, DataQualityReport, Sentiment } from '../../types';
import { parseToUtcTimestamp, getArticleAgeMinutes, getFreshnessClassification } from './freshness';
import { canonicalizeUrl } from './deduplicator';
import { processGeographicData } from './geoProcessor';
import { analyzeArticleSentiment } from './sentimentAnalyzer';

export interface ValidationResult {
  validArticles: NewsItem[];
  rejectedArticlesCount: number;
  rejectedReasons: string[];
  report: DataQualityReport;
}

export function validateAndCleanArticle(raw: Partial<NewsItem>): { valid: boolean; article?: NewsItem; reason?: string } {
  if (!raw.title || typeof raw.title !== 'string' || raw.title.trim().length < 5) {
    return { valid: false, reason: 'Title missing or too short (< 5 chars)' };
  }

  const title = raw.title.trim();
  const source = (raw.source || 'Unknown Publisher').trim();
  const rawUrl = raw.url || raw.canonicalUrl || '';
  const url = rawUrl.startsWith('http') ? rawUrl : (rawUrl ? `https://${rawUrl}` : `https://news.aggregator/${Math.random().toString(36).slice(2)}`);
  const description = raw.description || title;

  // Deterministic Local VADER Sentiment Analysis
  let sentiment: Sentiment = raw.sentiment || 'Neutral';
  let sentimentScore = typeof raw.sentimentScore === 'number' ? raw.sentimentScore : 0;
  let sentimentStatus: 'success' | 'failed' | 'pending' = raw.sentimentStatus || 'pending';
  let sentimentModel = raw.sentimentModel || 'vader-rule-engine-v1';
  let sentimentReason = raw.sentimentReason;

  // Compute sentiment if not explicitly provided with a trusted non-default model
  if (!raw.sentimentStatus || raw.sentimentStatus === 'pending' || (!raw.sentimentModel && sentiment === 'Neutral' && sentimentScore === 0)) {
    const sentimentResult = analyzeArticleSentiment({
      title,
      description,
      summary: raw.summary,
    });
    sentiment = sentimentResult.sentiment;
    sentimentScore = sentimentResult.score;
    sentimentStatus = sentimentResult.status;
    sentimentModel = sentimentResult.model;
    sentimentReason = sentimentResult.reason;
  }

  // Strict UTC Timestamp parsing (Preserves missing timestamps as null, records validation warning)
  const { utcTimestamp, isValid: dateValid, warning: dateWarning } = parseToUtcTimestamp(raw.timestamp);
  const ageMinutes = getArticleAgeMinutes(utcTimestamp);
  const freshnessStatus = getFreshnessClassification(utcTimestamp);
  const validationWarnings: string[] = [];
  if (dateWarning) {
    validationWarnings.push(dateWarning);
  }


  // Geographic normalization & coordinate validation
  const geo = processGeographicData({
    lat: raw.latitude ?? raw.region?.lat,
    lng: raw.longitude ?? raw.region?.lng,
    country: raw.country,
    city: raw.cityName,
    region: raw.region?.id,
    headlineOrTitle: title,
  });

  // Calculate Data Quality Score (0 to 100)
  let qualityScore = 50;
  if (title.length >= 15) qualityScore += 15;
  if (description.length > 20) qualityScore += 15;
  if (url.startsWith('http')) qualityScore += 10;
  if (dateValid) qualityScore += 5;
  if (raw.imageUrl) qualityScore += 2;
  if (raw.author) qualityScore += 3;
  if (geo.locationType === 'exact') qualityScore += 5;
  else if (geo.locationType === 'inferred') qualityScore += 2;

  qualityScore = Math.min(100, Math.max(0, qualityScore));

  const cleanItem: NewsItem = {
    id: raw.id || `news-${utcTimestamp || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    description,
    url,
    source,
    author: raw.author || null,
    category: raw.category || 'General',
    sentiment,
    sentimentScore,
    sentimentStatus,
    sentimentModel,
    sentimentReason,
    urgencyScore: raw.urgencyScore || 50,
    urgency: raw.urgency || 'medium',
    region: raw.region && raw.region.id !== 'global' && raw.region.lat !== 0 ? raw.region : { 
      id: geo.regionId, 
      name: geo.regionName, 
      lat: geo.latitude ?? 0, 
      lng: geo.longitude ?? 0 
    },
    country: geo.country || raw.country || null,
    latitude: geo.latitude,
    longitude: geo.longitude,
    cityName: geo.cityName || raw.cityName || null,
    locationType: geo.locationType,
    language: raw.language || 'English',
    imageUrl: raw.imageUrl || null,
    provider: raw.provider || 'RSS',
    timestamp: utcTimestamp,
    fetchedAt: raw.fetchedAt || Date.now(),
    summary: raw.summary || title,
    canonicalUrl: raw.canonicalUrl || canonicalizeUrl(url),
    contentHash: raw.contentHash || `${title.toLowerCase()}|${source.toLowerCase()}`,
    qualityScore,
    isSynthetic: Boolean(raw.isSynthetic),
    origin: raw.isSynthetic ? 'synthetic' : raw.origin || 'live',
    freshnessStatus,
    ageMinutes,
    eventClusterId: raw.eventClusterId,
    eventClusterName: raw.eventClusterName,
    validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
    rawData: raw.rawData,
  };

  return { valid: true, article: cleanItem };
}

export function evaluateBatchDataQuality(articles: NewsItem[], duplicateCount = 0): DataQualityReport {
  const totalEvaluated = articles.length + duplicateCount;
  if (totalEvaluated === 0) {
    return {
      totalEvaluated: 0,
      validCount: 0,
      duplicateCount: 0,
      malformedCount: 0,
      missingFieldsCount: 0,
      averageQualityScore: 0,
      qualityGrade: 'F',
      lastAuditTime: Date.now(),
    };
  }

  const validCount = articles.length;
  const malformedCount = 0;
  const totalScore = articles.reduce((acc, curr) => acc + curr.qualityScore, 0);
  const averageQualityScore = Math.round(totalScore / (validCount || 1));

  let missingFieldsCount = 0;
  articles.forEach(a => {
    if (!a.imageUrl) missingFieldsCount++;
    if (!a.author) missingFieldsCount++;
  });

  let qualityGrade: DataQualityReport['qualityGrade'] = 'A+';
  if (averageQualityScore >= 90) qualityGrade = 'A+';
  else if (averageQualityScore >= 80) qualityGrade = 'A';
  else if (averageQualityScore >= 70) qualityGrade = 'B';
  else if (averageQualityScore >= 60) qualityGrade = 'C';
  else if (averageQualityScore >= 50) qualityGrade = 'D';
  else qualityGrade = 'F';

  return {
    totalEvaluated,
    validCount,
    duplicateCount,
    malformedCount,
    missingFieldsCount,
    averageQualityScore,
    qualityGrade,
    lastAuditTime: Date.now(),
  };
}
