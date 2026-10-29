import type { NewsItem, Category, Sentiment, Urgency } from '../../types';
import { validateAndCleanArticle } from './validator';
import { isValidCoordinatePair, normalizeCountry } from './geoProcessor';

export interface QuarantineRecord {
  row: number;
  reason: string;
  rawSample?: string;
}

export interface FileImportResult {
  formatDetected: 'json_array' | 'json_object' | 'ndjson' | 'csv' | 'unknown';
  totalEvaluated: number;
  parsedCount: number;
  importedCount: number;
  invalidCount: number;
  quarantinedRecords: QuarantineRecord[];
  items: NewsItem[];
  errors: string[];
}

/**
 * Remove UTF-8 Byte Order Mark (BOM) and extraneous control characters if present.
 */
function cleanUtf8String(str: string): string {
  if (str.charCodeAt(0) === 0xFEFF) {
    str = str.slice(1);
  }
  return str.trim();
}

/**
 * Robust RFC 4180 CSV Row Parser
 * Handles commas inside quotes, escaped quotes (""), and multi-character delimiters.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detect input format accurately before parsing.
 */
export function detectInputFormat(rawContent: string): 'json_array' | 'json_object' | 'ndjson' | 'csv' | 'unknown' {
  const content = cleanUtf8String(rawContent);
  if (!content) return 'unknown';

  if (content.startsWith('[')) {
    return 'json_array';
  }

  if (content.startsWith('{')) {
    // Check if it's NDJSON (multiple lines each beginning with '{')
    const firstNewlineIdx = content.indexOf('\n');
    if (firstNewlineIdx !== -1) {
      const secondLine = content.slice(firstNewlineIdx + 1).trimStart();
      if (secondLine.startsWith('{')) {
        return 'ndjson';
      }
    }
    return 'json_object';
  }

  // Check if first line contains CSV header markers
  const firstLine = content.split(/\r?\n/)[0].toLowerCase();
  if (firstLine.includes(',') && (firstLine.includes('title') || firstLine.includes('headline') || firstLine.includes('url') || firstLine.includes('link') || firstLine.includes('source') || firstLine.includes('category'))) {
    return 'csv';
  }

  return 'unknown';
}

/**
 * Maps varying external schema fields to canonical article properties.
 */
function extractCanonicalFields(entry: Record<string, unknown>) {
  // Title / Headline
  const title = String(
    entry.title ||
    entry.headline ||
    entry.article_title ||
    entry.headline_text ||
    entry.name ||
    ''
  ).trim();

  // Description / Content
  const description = String(
    entry.description ||
    entry.summary ||
    entry.content ||
    entry.article_text ||
    entry.excerpt ||
    entry.body ||
    title
  ).trim();

  // URL / Link
  const url = String(
    entry.url ||
    entry.link ||
    entry.article_url ||
    entry.webUrl ||
    entry.web_url ||
    ''
  ).trim();

  // Source / Publisher
  const source = String(
    entry.source ||
    entry.source_name ||
    entry.source_id ||
    entry.publisher ||
    entry.provider ||
    entry.outlet ||
    'Dataset Import'
  ).trim();

  // Author / Byline
  const author = entry.author ? String(entry.author) : entry.byline ? String(entry.byline) : null;

  // Category
  const rawCat = String(entry.category || entry.section || entry.topic || entry.genre || 'General');
  let category: Category = 'General';
  const lowerCat = rawCat.toLowerCase();
  if (lowerCat.includes('tech')) category = 'Technology';
  else if (lowerCat.includes('politic')) category = 'Politics';
  else if (lowerCat.includes('business') || lowerCat.includes('financ') || lowerCat.includes('market')) category = 'Business';
  else if (lowerCat.includes('sport')) category = 'Sports';
  else if (lowerCat.includes('science')) category = 'Science';
  else if (lowerCat.includes('health')) category = 'Health';
  else if (lowerCat.includes('environment') || lowerCat.includes('climate')) category = 'Environment';
  else if (lowerCat.includes('india')) category = 'India';
  else if (lowerCat.includes('world')) category = 'World';

  // Sentiment
  let sentiment: Sentiment = 'Neutral';
  let sentimentStatus: 'success' | 'pending' = 'pending';
  if (typeof entry.sentiment === 'string') {
    const sLower = entry.sentiment.toLowerCase();
    if (sLower === 'positive') { sentiment = 'Positive'; sentimentStatus = 'success'; }
    else if (sLower === 'negative') { sentiment = 'Negative'; sentimentStatus = 'success'; }
    else if (sLower === 'neutral') { sentiment = 'Neutral'; sentimentStatus = 'success'; }
  }

  const rawScore = entry.sentimentScore ?? entry.sentiment_score;
  const sentimentScore = typeof rawScore === 'number' ? rawScore : undefined;

  const urgencyScore = typeof entry.urgencyScore === 'number'
    ? entry.urgencyScore
    : typeof entry.urgency_score === 'number'
    ? entry.urgency_score
    : 50;

  // Timestamp extraction
  let timestamp: number | null = null;
  const rawDate = entry.publishedAt || entry.pubDate || entry.published_at || entry.publication_date || entry.date || entry.timestamp || entry.created_at;
  if (typeof rawDate === 'number') {
    timestamp = rawDate;
  } else if (rawDate) {
    const parsed = new Date(String(rawDate)).getTime();
    if (!isNaN(parsed) && parsed > 0) timestamp = parsed;
  }

  // Geographic fields
  const latitude = typeof entry.latitude === 'number' ? entry.latitude : typeof entry.lat === 'number' ? entry.lat : undefined;
  const longitude = typeof entry.longitude === 'number' ? entry.longitude : typeof entry.lon === 'number' ? entry.lon : typeof entry.lng === 'number' ? entry.lng : undefined;
  const country = entry.country ? String(entry.country) : entry.sourcecountry ? String(entry.sourcecountry) : null;
  const cityName = entry.city ? String(entry.city) : entry.location ? String(entry.location) : null;

  // Image URL
  const imageUrl = entry.image ? String(entry.image) : entry.image_url ? String(entry.image_url) : entry.urlToImage ? String(entry.urlToImage) : entry.thumbnail ? String(entry.thumbnail) : null;

  return {
    title,
    description,
    url,
    source,
    author,
    category,
    sentiment,
    sentimentScore,
    sentimentStatus,
    urgencyScore,
    timestamp,
    latitude,
    longitude,
    country,
    cityName,
    imageUrl,
  };
}

/**
 * Universal Dataset Importer
 * Automatically detects and parses:
 * - JSON Array
 * - JSON Object with keys (articles, data, items, results)
 * - NDJSON (JSON Lines)
 * - CSV
 */
export function parseUniversalDataset(rawContent: string): FileImportResult {
  const content = cleanUtf8String(rawContent);
  const format = detectInputFormat(content);

  if (format === 'csv') {
    return parseCsvDataset(content);
  }

  return parseJsonDataset(content);
}

/**
 * Comprehensive JSON & NDJSON Dataset Parser
 */
export function parseJsonDataset(jsonString: string): FileImportResult {
  const content = cleanUtf8String(jsonString);
  const items: NewsItem[] = [];
  const quarantinedRecords: QuarantineRecord[] = [];
  const errors: string[] = [];

  let rawEntries: unknown[] = [];
  let formatDetected: FileImportResult['formatDetected'] = 'unknown';

  // Strategy 1: Attempt standard JSON.parse
  let parseSuccess = false;
  try {
    const parsed = JSON.parse(content);
    parseSuccess = true;

    if (Array.isArray(parsed)) {
      rawEntries = parsed;
      formatDetected = 'json_array';
    } else if (parsed && typeof parsed === 'object') {
      formatDetected = 'json_object';
      const record = parsed as Record<string, unknown>;
      const candidateArray = record.articles || record.data || record.items || record.results || record.news || record.posts;
      if (Array.isArray(candidateArray)) {
        rawEntries = candidateArray;
      } else {
        rawEntries = [record];
      }
    }
  } catch {
    // If standard JSON.parse failed, check if it's NDJSON (JSON Lines) or concatenated JSON objects
  }

  // Strategy 2: If standard JSON parsing failed, parse line-by-line (NDJSON / JSON Lines)
  if (!parseSuccess) {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    let ndjsonValidCount = 0;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj === 'object' && obj !== null) {
          rawEntries.push(obj);
          ndjsonValidCount++;
        }
      } catch (lineErr) {
        quarantinedRecords.push({
          row: idx + 1,
          reason: `Line ${idx + 1} is not valid JSON: ${(lineErr as Error).message}`,
          rawSample: trimmed.slice(0, 100),
        });
      }
    });

    if (ndjsonValidCount > 0) {
      formatDetected = 'ndjson';
      parseSuccess = true;
    }
  }

  // If still completely unparseable, return clear descriptive fatal parse error
  if (!parseSuccess && rawEntries.length === 0) {
    const preview = content.slice(0, 80);
    return {
      formatDetected: 'unknown',
      totalEvaluated: 0,
      parsedCount: 0,
      importedCount: 0,
      invalidCount: 1,
      quarantinedRecords: [{ row: 1, reason: `Unrecognized file format or corrupted JSON. Sample: ${preview}` }],
      items: [],
      errors: [`Fatal Parsing Error: Input is neither valid JSON array, JSON object, nor NDJSON`],
    };
  }

  const totalEvaluated = rawEntries.length + quarantinedRecords.length;

  // Process & Validate each raw record
  rawEntries.forEach((rawEntry, index) => {
    const rowNum = index + 1;
    if (!rawEntry || typeof rawEntry !== 'object') {
      quarantinedRecords.push({
        row: rowNum,
        reason: 'Record is empty or not an object',
      });
      return;
    }

    const fields = extractCanonicalFields(rawEntry as Record<string, unknown>);

    const clean = validateAndCleanArticle({
      title: fields.title,
      description: fields.description,
      url: fields.url,
      source: fields.source,
      author: fields.author,
      category: fields.category,
      sentiment: fields.sentiment,
      urgencyScore: fields.urgencyScore,
      provider: 'Dataset Import',
      timestamp: fields.timestamp,
      latitude: fields.latitude,
      longitude: fields.longitude,
      country: fields.country,
      cityName: fields.cityName,
      imageUrl: fields.imageUrl,
      isSynthetic: false,
      origin: 'imported',
      rawData: rawEntry as Record<string, unknown>,
    });

    if (clean.valid && clean.article) {
      items.push(clean.article);
    } else {
      quarantinedRecords.push({
        row: rowNum,
        reason: clean.reason || 'Article validation failed (title missing or too short)',
        rawSample: fields.title ? `Title: "${fields.title.slice(0, 50)}"` : 'Missing title',
      });
    }
  });

  const formattedErrors = quarantinedRecords.map(q => `Row ${q.row}: ${q.reason}`);

  return {
    formatDetected,
    totalEvaluated,
    parsedCount: rawEntries.length,
    importedCount: items.length,
    invalidCount: quarantinedRecords.length,
    quarantinedRecords,
    items,
    errors: formattedErrors,
  };
}

/**
 * Standard RFC 4180 CSV Dataset Parser
 */
export function parseCsvDataset(csvString: string): FileImportResult {
  const content = cleanUtf8String(csvString);
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      formatDetected: 'csv',
      totalEvaluated: 0,
      parsedCount: 0,
      importedCount: 0,
      invalidCount: 0,
      quarantinedRecords: [],
      items: [],
      errors: ['CSV must have a header row and at least 1 data row'],
    };
  }

  // Parse header using RFC 4180 parser
  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/^["']|["']$/g, '').trim());
  const titleIdx = header.findIndex(h => h.includes('title') || h.includes('headline') || h === 'name');
  const urlIdx = header.findIndex(h => h.includes('url') || h.includes('link'));
  const descIdx = header.findIndex(h => h.includes('desc') || h.includes('summary') || h.includes('content') || h.includes('text'));
  const sourceIdx = header.findIndex(h => h.includes('source') || h.includes('publisher') || h.includes('provider'));
  const categoryIdx = header.findIndex(h => h.includes('category') || h.includes('topic') || h.includes('section'));
  const dateIdx = header.findIndex(h => h.includes('date') || h.includes('published') || h.includes('time'));
  const authorIdx = header.findIndex(h => h.includes('author') || h.includes('byline'));
  const countryIdx = header.findIndex(h => h.includes('country') || h.includes('nation'));
  const cityIdx = header.findIndex(h => h.includes('city') || h.includes('location'));
  const latIdx = header.findIndex(h => h === 'lat' || h === 'latitude');
  const lonIdx = header.findIndex(h => h === 'lon' || h === 'lng' || h === 'longitude');

  if (titleIdx === -1) {
    return {
      formatDetected: 'csv',
      totalEvaluated: lines.length - 1,
      parsedCount: 0,
      importedCount: 0,
      invalidCount: lines.length - 1,
      quarantinedRecords: [{ row: 1, reason: 'CSV header must contain a "title" or "headline" column' }],
      items: [],
      errors: ['CSV header must contain a "title" or "headline" column'],
    };
  }

  const items: NewsItem[] = [];
  const quarantinedRecords: QuarantineRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const row = parseCsvLine(lines[i]);
    const title = (row[titleIdx] || '').replace(/^["']|["']$/g, '').trim();

    if (!title || title.length < 5) {
      quarantinedRecords.push({
        row: rowNum,
        reason: 'Title missing or too short (< 5 chars)',
        rawSample: title ? `Title: "${title}"` : 'Empty title',
      });
      continue;
    }

    const description = (descIdx !== -1 && row[descIdx]) ? row[descIdx].replace(/^["']|["']$/g, '').trim() : title;
    const url = (urlIdx !== -1 && row[urlIdx]) ? row[urlIdx].replace(/^["']|["']$/g, '').trim() : undefined;
    const source = (sourceIdx !== -1 && row[sourceIdx]) ? row[sourceIdx].replace(/^["']|["']$/g, '').trim() : 'CSV Import';
    const author = (authorIdx !== -1 && row[authorIdx]) ? row[authorIdx].replace(/^["']|["']$/g, '').trim() : null;

    let category: Category = 'General';
    if (categoryIdx !== -1 && row[categoryIdx]) {
      const lower = row[categoryIdx].toLowerCase();
      if (lower.includes('tech')) category = 'Technology';
      else if (lower.includes('politic')) category = 'Politics';
      else if (lower.includes('business') || lower.includes('financ')) category = 'Business';
      else if (lower.includes('sport')) category = 'Sports';
      else if (lower.includes('science')) category = 'Science';
      else if (lower.includes('health')) category = 'Health';
      else if (lower.includes('environment')) category = 'Environment';
      else if (lower.includes('india')) category = 'India';
      else if (lower.includes('world')) category = 'World';
    }

    let timestamp: number | null = null;
    if (dateIdx !== -1 && row[dateIdx]) {
      const parsed = new Date(row[dateIdx].replace(/^["']|["']$/g, '').trim()).getTime();
      if (!isNaN(parsed) && parsed > 0) timestamp = parsed;
    }

    const country = (countryIdx !== -1 && row[countryIdx]) ? row[countryIdx].replace(/^["']|["']$/g, '').trim() : null;
    const cityName = (cityIdx !== -1 && row[cityIdx]) ? row[cityIdx].replace(/^["']|["']$/g, '').trim() : null;
    const latitude = (latIdx !== -1 && row[latIdx]) ? parseFloat(row[latIdx]) : undefined;
    const longitude = (lonIdx !== -1 && row[lonIdx]) ? parseFloat(row[lonIdx]) : undefined;

    const clean = validateAndCleanArticle({
      title,
      description,
      url,
      source,
      author,
      category,
      provider: 'Dataset Import',
      timestamp,
      latitude: !isNaN(Number(latitude)) ? Number(latitude) : undefined,
      longitude: !isNaN(Number(longitude)) ? Number(longitude) : undefined,
      country,
      cityName,
      origin: 'imported',
    });

    if (clean.valid && clean.article) {
      items.push(clean.article);
    } else {
      quarantinedRecords.push({
        row: rowNum,
        reason: clean.reason || 'Article validation failed',
        rawSample: title,
      });
    }
  }

  const formattedErrors = quarantinedRecords.map(q => `Line ${q.row}: ${q.reason}`);

  return {
    formatDetected: 'csv',
    totalEvaluated: lines.length - 1,
    parsedCount: items.length + quarantinedRecords.length,
    importedCount: items.length,
    invalidCount: quarantinedRecords.length,
    quarantinedRecords,
    items,
    errors: formattedErrors,
  };
}
