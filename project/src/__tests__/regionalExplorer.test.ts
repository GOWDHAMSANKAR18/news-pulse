import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { NewsItem } from '../types';
import {
  filterOptions,
  getGeographicHierarchy,
  matchesRegionalFilters,
  type RegionalFilters,
} from '../lib/regionalExplorer';

const baseArticle = (overrides: Partial<NewsItem>): NewsItem => ({
  id: 'article-1',
  title: 'Chennai technology update',
  description: 'A regional technology story',
  url: 'https://example.com/article',
  source: 'Example',
  author: null,
  category: 'Technology',
  sentiment: 'Neutral',
  sentimentScore: 0,
  urgencyScore: 20,
  urgency: 'low',
  region: { id: 'chennai', name: 'Chennai', lat: 13, lng: 80 },
  country: 'India',
  cityName: 'Chennai',
  locationType: 'inferred',
  language: 'en',
  imageUrl: null,
  provider: 'RSS',
  timestamp: new Date('2026-10-20T12:00:00Z').getTime(),
  fetchedAt: Date.now(),
  summary: 'A regional technology story',
  canonicalUrl: 'https://example.com/article',
  contentHash: 'hash',
  qualityScore: 90,
  isSynthetic: false,
  ...overrides,
});

const emptyFilters: RegionalFilters = {
  continent: '',
  country: '',
  state: '',
  city: '',
  provider: '',
  category: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

describe('regional explorer geographic filtering', () => {
  test('derives continent from a known country without fabricating state data', () => {
    const geo = getGeographicHierarchy(baseArticle({ rawData: { title: 'story' } }));
    assert.equal(geo.continent, 'Asia');
    assert.equal(geo.state, null);
    assert.equal(geo.city, 'Chennai');
  });

  test('supports cascading option sets and incompatible child reset inputs', () => {
    const articles = [
      baseArticle({ id: 'in', country: 'India', cityName: 'Chennai', rawData: { state: 'Tamil Nadu' } }),
      baseArticle({ id: 'us', country: 'United States', cityName: 'New York', rawData: { state: 'New York' } }),
    ];
    const options = filterOptions(articles, { continent: 'Asia', country: 'India', state: '' });
    assert.deepEqual(options.countries, ['India']);
    assert.deepEqual(options.states, ['Tamil Nadu']);
    assert.deepEqual(options.cities, ['Chennai']);
  });

  test('combines geographic, date, provider, and search filters', () => {
    const article = baseArticle({ rawData: { state: 'Tamil Nadu' } });
    assert.equal(matchesRegionalFilters(article, {
      ...emptyFilters,
      continent: 'Asia',
      country: 'India',
      state: 'Tamil Nadu',
      city: 'Chennai',
      provider: 'RSS',
      search: 'technology',
      dateFrom: '2026-10-19',
      dateTo: '2026-10-21',
    }), true);
    assert.equal(matchesRegionalFilters(article, { ...emptyFilters, country: 'United States' }), false);
  });

  test('handles missing geographic metadata safely', () => {
    const article = baseArticle({ country: null, cityName: null, region: { id: 'global', name: 'Global / Unknown', lat: 0, lng: 0 } });
    assert.deepEqual(getGeographicHierarchy(article), { continent: null, country: null, state: null, city: null });
    assert.equal(matchesRegionalFilters(article, emptyFilters), true);
  });
});
