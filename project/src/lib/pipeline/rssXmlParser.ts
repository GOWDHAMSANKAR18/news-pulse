import type { NewsItem, Category, Sentiment, Urgency } from '../../types';
import { canonicalizeUrl } from './deduplicator';
import { parseToUtcTimestamp } from './freshness';
import { processGeographicData } from './geoProcessor';

export interface ParsedRssFeed {
  title: string;
  description?: string;
  items: NewsItem[];
  itemCount: number;
}

/**
 * Clean text from CDATA wrappers and HTML tags.
 */
function stripHtmlAndCdata(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[(.*?)\]\]>/gis, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Universal RSS 2.0 & Atom XML Feed Parser
 * Runs in both browser (DOMParser) and Node.js (via robust XML extraction).
 */
export function parseRssOrAtomXml(xmlText: string, defaultSource = 'RSS Feed', defaultCategory: Category = 'General'): ParsedRssFeed {
  const items: NewsItem[] = [];
  const now = Date.now();

  // Check if we are in browser environment with DOMParser available
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');

      // Check for XML parse error
      if (!doc.querySelector('parsererror')) {
        const feedTitle = doc.querySelector('channel > title, feed > title')?.textContent?.trim() || defaultSource;

        // Try RSS 2.0 items
        const rssItems = doc.querySelectorAll('item');
        if (rssItems.length > 0) {
          rssItems.forEach(el => {
            const title = stripHtmlAndCdata(el.querySelector('title')?.textContent || '');
            if (!title || title.length < 5) return;

            const link = el.querySelector('link')?.textContent?.trim() || '';
            const description = stripHtmlAndCdata(
              el.querySelector('content\\:encoded, encoded, description')?.textContent || title
            );
            const pubDateStr = el.querySelector('pubDate, dc\\:date, date')?.textContent?.trim();
            const author = el.querySelector('dc\\:creator, creator, author')?.textContent?.trim() || null;
            const enclosure = el.querySelector('enclosure')?.getAttribute('url') || el.querySelector('media\\:content')?.getAttribute('url') || null;

            const { utcTimestamp } = parseToUtcTimestamp(pubDateStr);
            const geo = processGeographicData({ headlineOrTitle: title });

            items.push({
              id: `rss-${utcTimestamp || now}-${Math.random().toString(36).slice(2, 7)}`,
              title,
              description,
              url: link,
              source: defaultSource,
              author,
              category: defaultCategory,
              sentiment: 'Neutral',
              sentimentScore: 0,
              urgencyScore: 45,
              urgency: 'medium',
              region: { id: geo.regionId, name: geo.regionName, lat: geo.latitude ?? 0, lng: geo.longitude ?? 0 },
              country: geo.country,
              latitude: geo.latitude,
              longitude: geo.longitude,
              cityName: geo.cityName,
              locationType: geo.locationType,
              language: 'en',
              imageUrl: enclosure,
              provider: 'RSS',
              timestamp: utcTimestamp,
              fetchedAt: now,
              summary: description,
              canonicalUrl: canonicalizeUrl(link),
              contentHash: `${title.toLowerCase()}|${defaultSource.toLowerCase()}`,
              qualityScore: 88,
              isSynthetic: false,
              origin: 'live',
            });
          });

          return { title: feedTitle, items, itemCount: items.length };
        }

        // Try Atom 1.0 entries
        const atomEntries = doc.querySelectorAll('entry');
        if (atomEntries.length > 0) {
          atomEntries.forEach(el => {
            const title = stripHtmlAndCdata(el.querySelector('title')?.textContent || '');
            if (!title || title.length < 5) return;

            const link = el.querySelector('link[href]')?.getAttribute('href') || el.querySelector('link')?.textContent?.trim() || '';
            const description = stripHtmlAndCdata(
              el.querySelector('summary, content')?.textContent || title
            );
            const dateStr = el.querySelector('published, updated')?.textContent?.trim();
            const author = el.querySelector('author > name')?.textContent?.trim() || null;

            const { utcTimestamp } = parseToUtcTimestamp(dateStr);
            const geo = processGeographicData({ headlineOrTitle: title });

            items.push({
              id: `atom-${utcTimestamp || now}-${Math.random().toString(36).slice(2, 7)}`,
              title,
              description,
              url: link,
              source: defaultSource,
              author,
              category: defaultCategory,
              sentiment: 'Neutral',
              sentimentScore: 0,
              urgencyScore: 45,
              urgency: 'medium',
              region: { id: geo.regionId, name: geo.regionName, lat: geo.latitude ?? 0, lng: geo.longitude ?? 0 },
              country: geo.country,
              latitude: geo.latitude,
              longitude: geo.longitude,
              cityName: geo.cityName,
              locationType: geo.locationType,
              language: 'en',
              imageUrl: null,
              provider: 'RSS',
              timestamp: utcTimestamp,
              fetchedAt: now,
              summary: description,
              canonicalUrl: canonicalizeUrl(link),
              contentHash: `${title.toLowerCase()}|${defaultSource.toLowerCase()}`,
              qualityScore: 88,
              isSynthetic: false,
              origin: 'live',
            });
          });

          return { title: feedTitle, items, itemCount: items.length };
        }
      }
    } catch {
      // Fallback to regex scanner below
    }
  }

  // Node.js and Fallback Regex-based XML Tag Extractor
  // Extract RSS Items
  const itemMatches = xmlText.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  if (itemMatches.length > 0) {
    itemMatches.forEach(itemXml => {
      const titleMatch = itemXml.match(/<title[\s>]([\s\S]*?)<\/title>/i);
      const title = stripHtmlAndCdata(titleMatch ? titleMatch[1] : '');
      if (!title || title.length < 5) return;

      const linkMatch = itemXml.match(/<link[\s>]([\s\S]*?)<\/link>/i);
      const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gis, '$1').trim() : '';

      const descMatch = itemXml.match(/<(?:content:encoded|description)[\s>]([\s\S]*?)<\/(?:content:encoded|description)>/i);
      const description = stripHtmlAndCdata(descMatch ? descMatch[1] : title);

      const pubDateMatch = itemXml.match(/<(?:pubDate|dc:date)[\s>]([\s\S]*?)<\/(?:pubDate|dc:date)>/i);
      const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : undefined;

      const authorMatch = itemXml.match(/<(?:dc:creator|author|creator)[\s>]([\s\S]*?)<\/(?:dc:creator|author|creator)>/i);
      const author = authorMatch ? stripHtmlAndCdata(authorMatch[1]) : null;

      const { utcTimestamp } = parseToUtcTimestamp(pubDateStr);
      const geo = processGeographicData({ headlineOrTitle: title });

      items.push({
        id: `rss-${utcTimestamp || now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description,
        url: link,
        source: defaultSource,
        author,
        category: defaultCategory,
        sentiment: 'Neutral',
        sentimentScore: 0,
        urgencyScore: 45,
        urgency: 'medium',
        region: { id: geo.regionId, name: geo.regionName, lat: geo.latitude ?? 0, lng: geo.longitude ?? 0 },
        country: geo.country,
        latitude: geo.latitude,
        longitude: geo.longitude,
        cityName: geo.cityName,
        locationType: geo.locationType,
        language: 'en',
        imageUrl: null,
        provider: 'RSS',
        timestamp: utcTimestamp,
        fetchedAt: now,
        summary: description,
        canonicalUrl: canonicalizeUrl(link),
        contentHash: `${title.toLowerCase()}|${defaultSource.toLowerCase()}`,
        qualityScore: 88,
        isSynthetic: false,
        origin: 'live',
      });
    });

    return { title: defaultSource, items, itemCount: items.length };
  }

  // Extract Atom Entries
  const entryMatches = xmlText.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  if (entryMatches.length > 0) {
    entryMatches.forEach(entryXml => {
      const titleMatch = entryXml.match(/<title[\s>]([\s\S]*?)<\/title>/i);
      const title = stripHtmlAndCdata(titleMatch ? titleMatch[1] : '');
      if (!title || title.length < 5) return;

      const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["']/i) || entryXml.match(/<link[\s>]([\s\S]*?)<\/link>/i);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const descMatch = entryXml.match(/<(?:summary|content)[\s>]([\s\S]*?)<\/(?:summary|content)>/i);
      const description = stripHtmlAndCdata(descMatch ? descMatch[1] : title);

      const dateMatch = entryXml.match(/<(?:published|updated)[\s>]([\s\S]*?)<\/(?:published|updated)>/i);
      const dateStr = dateMatch ? dateMatch[1].trim() : undefined;

      const { utcTimestamp } = parseToUtcTimestamp(dateStr);
      const geo = processGeographicData({ headlineOrTitle: title });

      items.push({
        id: `atom-${utcTimestamp || now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description,
        url: link,
        source: defaultSource,
        author: null,
        category: defaultCategory,
        sentiment: 'Neutral',
        sentimentScore: 0,
        urgencyScore: 45,
        urgency: 'medium',
        region: { id: geo.regionId, name: geo.regionName, lat: geo.latitude ?? 0, lng: geo.longitude ?? 0 },
        country: geo.country,
        latitude: geo.latitude,
        longitude: geo.longitude,
        cityName: geo.cityName,
        locationType: geo.locationType,
        language: 'en',
        imageUrl: null,
        provider: 'RSS',
        timestamp: utcTimestamp,
        fetchedAt: now,
        summary: description,
        canonicalUrl: canonicalizeUrl(link),
        contentHash: `${title.toLowerCase()}|${defaultSource.toLowerCase()}`,
        qualityScore: 88,
        isSynthetic: false,
        origin: 'live',
      });
    });

    return { title: defaultSource, items, itemCount: items.length };
  }

  return { title: defaultSource, items: [], itemCount: 0 };
}
