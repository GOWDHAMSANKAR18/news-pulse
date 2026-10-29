import { useMemo, useState } from 'react';
import { 
  Filter, 
  Search, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Archive, 
  AlertTriangle, 
  ArrowUpDown, 
} from 'lucide-react';
import type { NewsItem, Category, Sentiment, ProviderName, ProviderHealth } from '../types';
import type { DiagnosticResult } from '../lib/providers/providerManager';
import { getArticleAgeMinutes, type FreshnessStatus } from '../lib/pipeline/freshness';
import NewsCard from './NewsCard';
import ProviderStatusNotice from './ProviderStatusNotice';

interface LiveStreamProps {
  news: NewsItem[];
  historicalNews?: NewsItem[];
  lastSuccessFetchTime?: number | string | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onViewHistorical?: () => void;
  defaultMode?: 'all' | 'last60m' | 'historical';
  providerStatuses?: ProviderHealth[];
  totalDbStoredCount?: number;
  autoRefreshIntervalSeconds?: number;
  onRunDiagnostics?: () => Promise<DiagnosticResult[]>;
}

const CATEGORIES: (Category | 'All')[] = [
  'All', 'Technology', 'Politics', 'Business', 'Sports', 'World', 'India', 'Science', 'Health', 'Environment'
];
const SENTIMENTS: (Sentiment | 'All')[] = ['All', 'Positive', 'Neutral', 'Negative'];
const PROVIDERS: (ProviderName | 'All')[] = ['All', 'GDELT', 'GNews', 'The Guardian', 'RSS', 'Dataset Import'];
const FRESHNESS_OPTIONS: (FreshnessStatus | 'All')[] = ['All', 'Fresh', 'Delayed', 'Stale', 'Unknown'];

const PAGE_SIZE = 16;

export default function LiveStream({
  news,
  historicalNews = [],
  lastSuccessFetchTime = null,
  loading = false,
  error = null,
  onRefresh,
  onViewHistorical,
  defaultMode = 'all',
  providerStatuses = [],
  totalDbStoredCount = 0,
  autoRefreshIntervalSeconds = 300,
  onRunDiagnostics,
}: LiveStreamProps) {
  const [viewScope, setViewScope] = useState<'all' | 'last60m' | 'historical'>(defaultMode);
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [sentiment, setSentiment] = useState<Sentiment | 'All'>('All');
  const [provider, setProvider] = useState<ProviderName | 'All'>('All');
  const [freshness, setFreshness] = useState<FreshnessStatus | 'All'>('All');
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  // Compute 60-minute window news strictly
  const last60mNews = useMemo(() => {
    return news.filter((n) => {
      if (n.timestamp === null) return false;
      const ageMin = getArticleAgeMinutes(n.timestamp);
      return ageMin !== null && ageMin <= 60;
    });
  }, [news]);

  // Determine source pool based on explicit user view choice
  const sourcePool = useMemo(() => {
    if (viewScope === 'last60m') return last60mNews;
    if (viewScope === 'historical') {
      return historicalNews.length > 0 
        ? historicalNews 
        : news.filter(n => n.origin === 'historical' || (n.freshnessStatus === 'Stale' || n.freshnessStatus === 'Delayed'));
    }
    return news;
  }, [viewScope, last60mNews, historicalNews, news]);

  // Filter and sort items
  const filtered = useMemo(() => {
    return sourcePool
      .filter((n) => {
        if (category !== 'All' && n.category !== category) return false;
        if (sentiment !== 'All' && n.sentiment !== sentiment) return false;
        if (provider !== 'All' && n.provider !== provider) return false;
        if (freshness !== 'All' && n.freshnessStatus !== freshness) return false;
        if (query) {
          const q = query.toLowerCase();
          const matchTitle = n.title.toLowerCase().includes(q);
          const matchSource = n.source.toLowerCase().includes(q);
          const matchDesc = n.description?.toLowerCase().includes(q);
          if (!matchTitle && !matchSource && !matchDesc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') {
          if (a.timestamp === null) return 1;
          if (b.timestamp === null) return -1;
          return b.timestamp - a.timestamp;
        } else {
          if (a.timestamp === null) return 1;
          if (b.timestamp === null) return -1;
          return a.timestamp - b.timestamp;
        }
      });
  }, [sourcePool, category, sentiment, provider, freshness, query, sortOrder]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginatedNews = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const freshCount = news.filter((n) => n.freshnessStatus === 'Fresh').length;
  const newestArticle = news.find(n => n.timestamp !== null);
  const newestArticleAge = newestArticle ? getArticleAgeMinutes(newestArticle.timestamp) : null;

  return (
    <div className="space-y-5">
      {/* Informational banner when last60m feed is empty: NO FORCED REDIRECT */}
      {viewScope === 'last60m' && last60mNews.length === 0 && !loading && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-neutral-300 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-white">No articles published within the last 60 minutes</p>
              <p className="text-neutral-400 text-xs mt-0.5">
                External publishers may not have pushed new articles in the past hour. 
                {newestArticleAge !== null 
                  ? ` The newest available article was published ${newestArticleAge} minutes ago.`
                  : ' Showing historical articles.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setViewScope('all'); setPage(1); }}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs border border-neutral-600 transition-all"
            >
              Show All Stored News ({news.length})
            </button>
            {onViewHistorical && (
              <button
                onClick={onViewHistorical}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs border border-neutral-600 transition-all flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5 text-sky-400" />
                Historical View
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actionable Provider Notice & Diagnostics Status Panel */}
      {error && (
        <ProviderStatusNotice
          error={error}
          providerStatuses={providerStatuses}
          lastSuccessFetchTime={lastSuccessFetchTime}
          totalDbStoredCount={totalDbStoredCount}
          autoRefreshIntervalSeconds={autoRefreshIntervalSeconds}
          loading={loading}
          onRefresh={onRefresh || (() => {})}
          onViewHistorical={onViewHistorical}
          onRunDiagnostics={onRunDiagnostics}
        />
      )}

      {/* Header Bar & View Scope Switcher */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <TrendingUp className="w-5 h-5 text-white" />
            Live &amp; Real-Time News Stream
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            {filtered.length} articles displayed · <strong className="text-emerald-400 font-mono">{freshCount} Fresh (&lt;60m)</strong>
            {lastSuccessFetchTime ? ` · Last polled ${new Date(lastSuccessFetchTime).toLocaleTimeString()}` : ''}
          </p>
        </div>

        {/* View Scope Tabs */}
        <div className="flex items-center gap-1 bg-black p-1 rounded-xl border border-neutral-800">
          <button
            onClick={() => { setViewScope('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewScope === 'all'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All Stream ({news.length})
          </button>
          <button
            onClick={() => { setViewScope('last60m'); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewScope === 'last60m'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            Last 60 Minutes ({last60mNews.length})
          </button>
          <button
            onClick={() => { setViewScope('historical'); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewScope === 'historical'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-sky-400" />
            Historical Archive
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl p-4 space-y-3 bg-black border border-neutral-800">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 text-xs text-neutral-400 font-semibold mr-1">
              <Filter className="w-3.5 h-3.5 text-neutral-400" />
              <span>Category:</span>
            </div>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  category === c
                    ? 'bg-neutral-800 text-white border border-neutral-600'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search headline, publisher, topic..."
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
            />
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-neutral-800 text-xs text-neutral-400">
          {/* Freshness Filter */}
          <div className="flex items-center gap-1.5">
            <span>Freshness:</span>
            <select
              value={freshness}
              onChange={(e) => { setFreshness(e.target.value as FreshnessStatus | 'All'); setPage(1); }}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              {FRESHNESS_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f} {f === 'Fresh' ? '(<60m)' : f === 'Delayed' ? '(1h-12h)' : f === 'Stale' ? '(>12h)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Provider Filter */}
          <div className="flex items-center gap-1.5">
            <span>Provider:</span>
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value as ProviderName | 'All'); setPage(1); }}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Sentiment Filter */}
          <div className="flex items-center gap-1.5">
            <span>Sentiment:</span>
            <select
              value={sentiment}
              onChange={(e) => { setSentiment(e.target.value as Sentiment | 'All'); setPage(1); }}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              {SENTIMENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white font-mono text-xs"
            >
              <ArrowUpDown className="w-3 h-3 text-neutral-400" />
              <span>{sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}</span>
            </button>
            <span className="font-mono text-neutral-500 pl-2">
              Page {page} / {totalPages}
            </span>
          </div>
        </div>
      </div>

      {/* Grid or Useful Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center text-neutral-400 space-y-3 bg-black border border-neutral-800">
          <Archive className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Articles Match the Selected Criteria</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Try adjusting your search keywords, category filters, or freshness settings to expand the results.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => { setCategory('All'); setSentiment('All'); setProvider('All'); setFreshness('All'); setQuery(''); }}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
            >
              Reset Filters
            </button>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
              >
                Fetch News Now
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedNews.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-800 pt-4 text-xs text-neutral-400">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} articles
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono px-2 text-white">{page}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
