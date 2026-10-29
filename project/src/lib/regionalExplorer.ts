import type { NewsItem } from '../types';

export interface GeographicHierarchy {
  continent: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
}

export interface RegionalFilters {
  continent: string;
  country: string;
  state: string;
  city: string;
  provider: string;
  category: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const COUNTRY_CONTINENTS: Record<string, string> = {
  Australia: 'Oceania',
  Brazil: 'South America',
  Canada: 'North America',
  China: 'Asia',
  France: 'Europe',
  Germany: 'Europe',
  India: 'Asia',
  Israel: 'Asia',
  Italy: 'Europe',
  Japan: 'Asia',
  Mexico: 'North America',
  Russia: 'Europe',
  'Singapore': 'Asia',
  'South Africa': 'Africa',
  'South Korea': 'Asia',
  'Spain': 'Europe',
  Switzerland: 'Europe',
  UAE: 'Asia',
  Ukraine: 'Europe',
  'United Kingdom': 'Europe',
  'United States': 'North America',
};

const RAW_STATE_KEYS = [
  'administrative_region',
  'administrativeRegion',
  'state',
  'state_name',
  'stateName',
  'province',
  'province_name',
  'provinceName',
  'region',
];

function readString(record: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function getGeographicHierarchy(item: NewsItem): GeographicHierarchy {
  const country = item.country?.trim() || null;
  const rawData = item.rawData;
  const state = item.administrativeRegion?.trim()
    || readString(rawData, RAW_STATE_KEYS);
  const city = item.cityName?.trim() || null;
  return {
    continent: item.continent?.trim() || (country ? COUNTRY_CONTINENTS[country] || null : null),
    country,
    state: state || null,
    city,
  };
}

export function matchesRegionalFilters(item: NewsItem, filters: RegionalFilters): boolean {
  const geo = getGeographicHierarchy(item);
  const normalizedSearch = filters.search.trim().toLowerCase();
  const published = item.timestamp ? new Date(item.timestamp) : null;
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;

  if (filters.continent && geo.continent !== filters.continent) return false;
  if (filters.country && geo.country !== filters.country) return false;
  if (filters.state && geo.state !== filters.state) return false;
  if (filters.city && geo.city !== filters.city) return false;
  if (filters.provider && item.provider !== filters.provider) return false;
  if (filters.category && item.category !== filters.category) return false;
  if (from !== null && (!published || published.getTime() < from)) return false;
  if (to !== null && (!published || published.getTime() > to)) return false;
  if (normalizedSearch) {
    const haystack = `${item.title} ${item.description} ${item.source}`.toLowerCase();
    if (!haystack.includes(normalizedSearch)) return false;
  }
  return true;
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
    .sort((a, b) => a.localeCompare(b));
}

export function filterOptions(
  news: NewsItem[],
  filters: Pick<RegionalFilters, 'continent' | 'country' | 'state'>,
): { continents: string[]; countries: string[]; states: string[]; cities: string[] } {
  const records = news.map((item) => ({ item, geo: getGeographicHierarchy(item) }));
  const byContinent = records.filter(({ geo }) => !filters.continent || geo.continent === filters.continent);
  const byCountry = byContinent.filter(({ geo }) => !filters.country || geo.country === filters.country);
  const byState = byCountry.filter(({ geo }) => !filters.state || geo.state === filters.state);
  return {
    continents: uniqueSorted(records.map(({ geo }) => geo.continent)),
    countries: uniqueSorted(byContinent.map(({ geo }) => geo.country)),
    states: uniqueSorted(byCountry.map(({ geo }) => geo.state)),
    cities: uniqueSorted(byState.map(({ geo }) => geo.city)),
  };
}

export function getRegionalAnalytics(news: NewsItem[]) {
  const providerCounts: Record<string, number> = {};
  const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 };
  const categoryCounts: Record<string, number> = {};
  let geocoded = 0;

  for (const item of news) {
    providerCounts[item.provider] = (providerCounts[item.provider] || 0) + 1;
    sentimentCounts[item.sentiment]++;
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    const geo = getGeographicHierarchy(item);
    if (geo.continent || geo.country || geo.state || geo.city) geocoded++;
  }

  return {
    providerCounts,
    sentimentCounts,
    categoryCounts,
    geocodedPercentage: news.length ? Math.round((geocoded / news.length) * 100) : 0,
  };
}
