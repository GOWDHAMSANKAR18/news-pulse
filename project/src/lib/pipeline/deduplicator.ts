import type { NewsItem } from '../../types';

export interface DeduplicationResult {
  deduplicatedNews: NewsItem[];
  duplicatesRemovedCount: number;
  duplicateHashes: string[];
}

export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    // Strip common tracking and analytics query parameters
    const paramsToKeep: [string, string][] = [];
    url.searchParams.forEach((value, key) => {
      if (!/^(utm_|fbclid|gclid|_ga|ref|rss|src|mc_cid|mc_eid)/i.test(key)) {
        paramsToKeep.push([key, value]);
      }
    });
    
    url.search = '';
    paramsToKeep.forEach(([k, v]) => url.searchParams.append(k, v));
    return url.toString().replace(/\/$/, '');
  } catch {
    return rawUrl.split('?')[0].replace(/\/$/, '');
  }
}

export function generateContentHash(title: string, source: string): string {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normalizedTitle}|${normalizedSource}`;
}

export function deduplicateArticles(articles: NewsItem[]): DeduplicationResult {
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const deduplicatedNews: NewsItem[] = [];
  const duplicateHashes: string[] = [];
  let duplicatesRemovedCount = 0;

  for (const article of articles) {
    const canonical = canonicalizeUrl(article.url || article.canonicalUrl);
    const hash = article.contentHash || generateContentHash(article.title, article.source);

    if (seenHashes.has(hash) || (canonical && seenUrls.has(canonical))) {
      duplicatesRemovedCount++;
      duplicateHashes.push(hash);
      continue;
    }

    seenHashes.add(hash);
    if (canonical) seenUrls.add(canonical);
    
    deduplicatedNews.push({
      ...article,
      canonicalUrl: canonical,
      contentHash: hash,
    });
  }

  return {
    deduplicatedNews,
    duplicatesRemovedCount,
    duplicateHashes,
  };
}
