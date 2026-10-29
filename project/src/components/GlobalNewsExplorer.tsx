import { useMemo, useState } from 'react';
import { Globe2, RotateCcw, Search, X } from 'lucide-react';
import type { NewsItem } from '../types';
import {
  filterOptions,
  getGeographicHierarchy,
  getRegionalAnalytics,
  matchesRegionalFilters,
  type RegionalFilters,
} from '../lib/regionalExplorer';
import { extractTfidfKeywords } from '../lib/pipeline/nlpAnalytics';
import NewsCard from './NewsCard';

interface GlobalNewsExplorerProps {
  news: NewsItem[];
}

const EMPTY_FILTERS: RegionalFilters = {
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

function SelectFilter({ label, value, options, disabled, onChange }: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-neutral-400">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-neutral-800 bg-black px-2.5 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <option value="">All {label}s</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function GlobalNewsExplorer({ news }: GlobalNewsExplorerProps) {
  const [filters, setFilters] = useState<RegionalFilters>(EMPTY_FILTERS);
  const options = useMemo(
    () => filterOptions(news, filters),
    [news, filters],
  );
  const providers = useMemo(() => [...new Set(news.map((item) => item.provider))].sort(), [news]);
  const categories = useMemo(() => [...new Set(news.map((item) => item.category))].sort(), [news]);
  const filteredNews = useMemo(
    () => news.filter((item) => matchesRegionalFilters(item, filters)),
    [news, filters],
  );
  const analytics = useMemo(() => getRegionalAnalytics(filteredNews), [filteredNews]);
  const keywords = useMemo(
    () => extractTfidfKeywords(filteredNews, 8),
    [filteredNews],
  );
  const activeChips = Object.entries(filters).filter(([, value]) => value);

  const updateFilter = (key: keyof RegionalFilters, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'continent') {
        next.country = '';
        next.state = '';
        next.city = '';
      } else if (key === 'country') {
        next.state = '';
        next.city = '';
      } else if (key === 'state') {
        next.city = '';
      }
      return next;
    });
  };

  const reset = () => setFilters(EMPTY_FILTERS);
  const removeChip = (key: string) => updateFilter(key as keyof RegionalFilters, '');
  const keywordsForRegion = keywords.slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <Globe2 className="h-5 w-5 text-sky-400" /> Global News Explorer
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Explore the currently loaded article set by available geographic metadata. Unknown locations remain unclassified.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectFilter label="Continent" value={filters.continent} options={options.continents} onChange={(value) => updateFilter('continent', value)} />
          <SelectFilter label="Country" value={filters.country} options={options.countries} disabled={!filters.continent && options.countries.length === 0} onChange={(value) => updateFilter('country', value)} />
          <SelectFilter label="State / Region" value={filters.state} options={options.states} disabled={!filters.country || options.states.length === 0} onChange={(value) => updateFilter('state', value)} />
          <SelectFilter label="City" value={filters.city} options={options.cities} disabled={!filters.state || options.cities.length === 0} onChange={(value) => updateFilter('city', value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative space-y-1 text-xs text-neutral-400 lg:col-span-2">
            <span>Search headlines and descriptions</span>
            <Search className="absolute left-2.5 top-8 h-3.5 w-3.5 text-neutral-500" />
            <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search articles..." className="w-full rounded-lg border border-neutral-800 bg-black py-2 pl-8 pr-2.5 text-xs text-white placeholder:text-neutral-600" />
          </label>
          <SelectFilter label="Provider" value={filters.provider} options={providers} onChange={(value) => updateFilter('provider', value)} />
          <SelectFilter label="Category" value={filters.category} options={categories} onChange={(value) => updateFilter('category', value)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-neutral-400"><span>From</span><input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black px-2 py-2 text-xs text-white" /></label>
            <label className="space-y-1 text-xs text-neutral-400"><span>To</span><input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} className="w-full rounded-lg border border-neutral-800 bg-black px-2 py-2 text-xs text-white" /></label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map(([key, value]) => <button key={key} onClick={() => removeChip(key)} className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200">{key}: {value}<X className="h-3 w-3" /></button>)}
          <button onClick={reset} className="ml-auto flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Reset All Filters</button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Matching articles', filteredNews.length.toLocaleString()],
          ['With geographic metadata', `${analytics.geocodedPercentage}%`],
          ['Providers represented', Object.keys(analytics.providerCounts).length.toString()],
          ['Sentiment analyzed', filteredNews.filter((item) => item.sentimentStatus !== 'failed').length.toLocaleString()],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-800 bg-black p-4"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 font-mono text-xl font-bold text-white">{value}</p></div>)}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h3 className="text-sm font-bold text-white">Regional intelligence</h3>
          <p className="mt-1 text-[11px] text-neutral-500">Automated text analysis; not a measure of factual accuracy.</p>
          <div className="mt-4 space-y-2 text-xs text-neutral-300">
            {Object.entries(analytics.sentimentCounts).map(([sentiment, count]) => <div key={sentiment} className="flex justify-between"><span>{sentiment}</span><strong>{count}</strong></div>)}
            {Object.entries(analytics.providerCounts).map(([provider, count]) => <div key={provider} className="flex justify-between text-neutral-400"><span>{provider}</span><span>{count}</span></div>)}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-white">Top keywords and coverage</h3>
          <div className="mt-3 flex flex-wrap gap-2">{keywordsForRegion.length ? keywordsForRegion.map((keyword) => <span key={keyword.keyword} className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300">{keyword.keyword} · {keyword.count}</span>) : <span className="text-xs text-neutral-500">No keywords available for this dataset.</span>}</div>
          <p className="mt-4 text-xs text-neutral-500">{filteredNews.length ? `${filteredNews.filter((item) => getGeographicHierarchy(item).country).length} articles have country-level coverage.` : 'No articles match the selected filters.'}</p>
        </div>
      </section>

      {filteredNews.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{filteredNews.slice(0, 24).map((item) => <NewsCard key={item.id} item={item} />)}</div> : <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-10 text-center text-sm text-neutral-400">No articles match these filters. Try clearing a geographic or date selection.</div>}
      {filteredNews.length > 24 && <p className="text-center text-xs text-neutral-500">Showing the first 24 matching articles from the loaded dataset.</p>}
    </div>
  );
}
