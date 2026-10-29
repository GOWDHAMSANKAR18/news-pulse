import { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Loader2, 
  Database, 
  Layers, 
  Clock, 
  Radio, 
  TrendingUp, 
  CheckCircle2, 
} from 'lucide-react';
import NavBar, { type TabId } from './components/NavBar';
import BreakingNewsTicker from './components/BreakingNewsTicker';
import LiveStream from './components/LiveStream';
import Analytics from './components/Analytics';
import FiveVsDashboard from './components/FiveVsDashboard';
import DataImportView from './components/DataImportView';
import GeographicView from './components/GeographicView';
import GlobalNewsExplorer from './components/GlobalNewsExplorer';
import SystemMonitor from './components/SystemMonitor';
import NewsCard from './components/NewsCard';
import { useNewsStream } from './useNewsStream';
import { timeAgo } from './uiConstants';

export default function App() {
  const [tab, setTab] = useState<TabId>('overview');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const stream = useNewsStream();

  // Local clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const healthyProvidersCount = stream.providerStatuses.filter(p => p.status === 'Healthy').length;
  const totalProvidersCount = stream.providerStatuses.length;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-neutral-800 selection:text-white">
      {/* Top Navigation */}
      <NavBar 
        active={tab} 
        onChange={setTab} 
        liveCount={stream.news.length} 
        dataState={stream.dataState} 
      />

      {/* Breaking News Ticker */}
      <BreakingNewsTicker breaking={stream.breaking} />

      <main className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-6">
        {/* Real-Time Platform Header Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 rounded-2xl bg-black border border-neutral-800 shadow-md">
          {/* Platform Identity & Clock */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-bold tracking-wider text-white uppercase font-mono">
                  NEWS PULSE — BIG DATA INTELLIGENCE
                </h2>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                {currentTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} · {currentTime.toLocaleTimeString()} Local Time
              </p>
            </div>

            <div className="hidden sm:block h-6 w-px bg-neutral-800" />

            {/* Ingestion Freshness Metadata */}
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>
                Last Ingestion:{' '}
                <strong className="text-white font-mono">
                  {stream.lastSuccessCollectionTime ? timeAgo(stream.lastSuccessCollectionTime) : 'Initial Poll Pending'}
                </strong>
              </span>
              {stream.newestArticleAgeMinutes !== null && (
                <span className="text-[11px] text-neutral-500 font-mono">
                  (Newest article: {stream.newestArticleAgeMinutes}m old)
                </span>
              )}
            </div>
          </div>

          {/* Controls: Auto-Refresh interval selector & Manual Refresh */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Auto-Refresh Configuration */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-xl border border-neutral-800 text-xs">
              <span className="text-[11px] text-neutral-400 font-medium">Auto-Poll:</span>
              <select
                value={stream.autoRefreshIntervalSeconds}
                onChange={(e) => stream.setAutoRefreshIntervalSeconds(Number(e.target.value))}
                className="bg-black text-white text-xs border border-neutral-800 rounded px-1.5 py-0.5 focus:outline-none"
              >
                <option value={60}>Every 1 Min</option>
                <option value={300}>Every 5 Min (Recommended)</option>
                <option value={600}>Every 10 Min</option>
                <option value={0}>Paused</option>
              </select>
            </div>

            {/* Historical Backfill Action */}
            <button
              onClick={stream.triggerHistoricalBackfill}
              disabled={stream.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white hover:border-neutral-700 transition-all disabled:opacity-50"
              title="Query older stored records from PostgreSQL"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Historical Backfill
            </button>

            {/* Manual Fetch Action */}
            <button
              onClick={stream.refresh}
              disabled={stream.loading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              {stream.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-black" />
              )}
              {stream.loading ? 'Polling APIs...' : 'Poll News Now'}
            </button>
          </div>
        </div>

        {/* Real KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* KPI 1: Total Stored */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">1. Total Stored</span>
              <Database className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">
              {stream.totalDbStoredCount.toLocaleString()}
            </div>
            <p className="text-[10px] text-neutral-500 truncate">PostgreSQL news_articles</p>
          </div>

          {/* KPI 2: Inserted Last Run */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">2. Ingested Run</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              +{stream.insertedLastRunCount}
            </div>
            <p className="text-[10px] text-neutral-500 truncate">Latest collection cycle</p>
          </div>

          {/* KPI 3: Fetched Last Run */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">3. Fetched Run</span>
              <Radio className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">
              {stream.fetchedLastRunCount}
            </div>
            <p className="text-[10px] text-neutral-500 truncate">Across active providers</p>
          </div>

          {/* KPI 4: Duplicates Filtered */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">4. Dupes Filtered</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 tabular-nums">
              {stream.skippedDuplicatesCount}
            </div>
            <p className="text-[10px] text-neutral-500 truncate">Content-hash &amp; URL dedup</p>
          </div>

          {/* KPI 5: Active Providers */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">5. Healthy Feeds</span>
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">
              {healthyProvidersCount} / {totalProvidersCount}
            </div>
            <p className="text-[10px] text-neutral-500 truncate">GDELT · GNews · Guardian · RSS</p>
          </div>

          {/* KPI 6: Ingestion Duration */}
          <div className="p-4 rounded-xl bg-black border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span className="uppercase text-[10px] tracking-wider font-semibold">6. Execution Time</span>
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
            </div>
            <div className="text-xl font-bold font-mono text-neutral-200 tabular-nums">
              {stream.pipeline.latencyMs} ms
            </div>
            <p className="text-[10px] text-neutral-500 truncate">Full pipeline duration</p>
          </div>
        </div>

        {/* Feature Views */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Analytics & Distribution Overview */}
            <Analytics
              news={stream.news}
              ingestionHistory={stream.ingestionHistory}
              keywords={stream.keywords}
              sentiment={stream.sentimentBreakdown}
              throughput={stream.pipeline.throughputPerMin}
              latency={stream.pipeline.latencyMs}
              eventClusters={stream.eventClusters}
              topicGrowth={stream.topicGrowth}
              providerStatuses={stream.providerStatuses}
              fetchedCount={stream.fetchedLastRunCount}
              insertedCount={stream.insertedLastRunCount}
              duplicatesCount={stream.skippedDuplicatesCount}
              rejectedCount={stream.rejectedLastRunCount}
              onReprocessSentiment={stream.reprocessSentiment}
              isReprocessingSentiment={stream.isReprocessingSentiment}
              lastReprocessStats={stream.lastSentimentReprocessStats}
            />

            {/* Recent Live Feed Excerpt */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-white" />
                  Latest Ingested Articles Stream
                </h3>
                <button
                  onClick={() => setTab('live')}
                  className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
                >
                  View All {stream.news.length} in Live View &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stream.news.slice(0, 8).map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'live' && (
          <LiveStream
            news={stream.news}
            historicalNews={stream.historicalNews}
            lastSuccessFetchTime={stream.lastSuccessCollectionTime}
            loading={stream.loading}
            error={stream.error}
            onRefresh={stream.refresh}
            onViewHistorical={() => setTab('historical')}
            defaultMode="all"
            providerStatuses={stream.providerStatuses}
            totalDbStoredCount={stream.totalDbStoredCount}
            autoRefreshIntervalSeconds={stream.autoRefreshIntervalSeconds}
            onRunDiagnostics={stream.runDiagnostics}
          />
        )}

        {tab === 'analytics' && (
          <Analytics
            news={stream.news}
            ingestionHistory={stream.ingestionHistory}
            keywords={stream.keywords}
            sentiment={stream.sentimentBreakdown}
            throughput={stream.pipeline.throughputPerMin}
            latency={stream.pipeline.latencyMs}
            eventClusters={stream.eventClusters}
            topicGrowth={stream.topicGrowth}
            providerStatuses={stream.providerStatuses}
            fetchedCount={stream.fetchedLastRunCount}
            insertedCount={stream.insertedLastRunCount}
            duplicatesCount={stream.skippedDuplicatesCount}
            rejectedCount={stream.rejectedLastRunCount}
            onReprocessSentiment={stream.reprocessSentiment}
            isReprocessingSentiment={stream.isReprocessingSentiment}
            lastReprocessStats={stream.lastSentimentReprocessStats}
          />
        )}

        {tab === 'providers' && (
          <SystemMonitor
            pipeline={stream.pipeline}
            logs={stream.logs}
            providers={stream.providerStatuses}
            qualityReport={stream.qualityReport}
            onRunDiagnostics={stream.runDiagnostics}
          />
        )}

        {tab === 'fiveVs' && (
          <FiveVsDashboard
            metrics={stream.fiveVs}
            onHistoricalBackfill={stream.triggerHistoricalBackfill}
            onRunVolumeTest={() => {
              stream.runVolumeStressTest(1000);
              setTab('import');
            }}
          />
        )}

        {tab === 'historical' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-400" />
                  PostgreSQL Stored Historical Archive
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Showing historical records accumulated in PostgreSQL. Use &ldquo;Historical Backfill&rdquo; to sync deep archives.
                </p>
              </div>
              <button
                onClick={stream.triggerHistoricalBackfill}
                disabled={stream.loading}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs border border-neutral-700"
              >
                Backfill Stored History
              </button>
            </div>
            <LiveStream
              news={stream.news}
              historicalNews={stream.historicalNews}
              loading={stream.loading}
              error={stream.error}
              onRefresh={stream.refresh}
              defaultMode="historical"
            />
          </div>
        )}

        {tab === 'import' && (
          <DataImportView
            onRunVolumeTest={stream.runVolumeStressTest}
            onImportDataset={stream.importDataset}
          />
        )}

        {tab === 'geo' && <GeographicView news={stream.news} />}

        {tab === 'globalExplorer' && (
          <GlobalNewsExplorer news={stream.news} />
        )}

        {tab === 'system' && (
          <SystemMonitor
            pipeline={stream.pipeline}
            logs={stream.logs}
            providers={stream.providerStatuses}
            qualityReport={stream.qualityReport}
            onRunDiagnostics={stream.runDiagnostics}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 mt-12 py-6 bg-black text-xs text-neutral-500">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>NEWS PULSE — Real-Time Big Data News Analytics Platform</span>
          <span className="font-mono text-neutral-400">
            PostgreSQL Database: {stream.totalDbStoredCount.toLocaleString()} Records Stored · {stream.dataState} Mode
          </span>
        </div>
      </footer>
    </div>
  );
}
