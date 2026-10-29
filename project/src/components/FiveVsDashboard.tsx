import React from 'react';
import { Database, Zap, Layers, ShieldCheck, Lightbulb, Play, RefreshCw } from 'lucide-react';
import type { FiveVsMetrics } from '../types';

interface FiveVsDashboardProps {
  metrics: FiveVsMetrics;
  onRunVolumeTest: () => void;
  onHistoricalBackfill?: () => void;
}

export default function FiveVsDashboard({ metrics, onRunVolumeTest, onHistoricalBackfill }: FiveVsDashboardProps) {
  const { volume, velocity, variety, veracity, value } = metrics;

  return (
    <div className="space-y-6">
      {/* Dark Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 rounded-2xl border border-pulse-500/20 bg-gradient-to-r from-ink-950 via-ink-900 to-ink-950 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pulse-500/15 border border-pulse-500/30 text-pulse-300 text-xs font-semibold mb-2">
            <Zap className="w-3.5 h-3.5" /> Academic Big Data Framework
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            The 5 Vs of Big Data Architecture
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Empirical metrics and proof points demonstrating Volume, Velocity, Variety, Veracity, and Value across real news streams.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {onHistoricalBackfill && (
            <button
              onClick={onHistoricalBackfill}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-900 hover:bg-ink-850 text-slate-200 border border-ink-700/60 font-semibold text-xs shadow-md transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-pulse-400" />
              Historical Date Backfill
            </button>
          )}

          <button
            onClick={onRunVolumeTest}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pulse-500 to-signal-600 hover:from-pulse-400 hover:to-signal-500 text-white font-semibold text-xs shadow-lg shadow-pulse-500/25 transition-all transform active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run Volume Stress Test (1k Records)
          </button>
        </div>
      </div>

      {/* 5 Vs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* 1. VOLUME PANEL */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 hover:border-pulse-500/40 transition-all flex flex-col justify-between bg-ink-900/80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-pulse-500/15 flex items-center justify-center text-pulse-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">1. VOLUME</h3>
                  <span className="text-[11px] text-slate-400 font-mono">Database Scale &amp; Storage</span>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-1 rounded bg-ink-950 text-pulse-300 border border-ink-800">
                {volume.estimatedStorageKb} KB
              </span>
            </div>

            <div className="space-y-3 my-4">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Total DB Stored Articles:</span>
                <span className="font-bold text-pulse-400 font-mono">{volume.realArticlesCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Synthetic Stress Records:</span>
                <span className="font-bold text-signal-400 font-mono">{volume.syntheticCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Total Processed Records:</span>
                <span className="font-bold text-white font-mono">{volume.processedRecords.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Last Batch Execution:</span>
                <span className="font-semibold text-slate-200 font-mono">{volume.lastBatchExecutionMs} ms</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-ink-800/60 text-[11px] text-slate-400">
            <strong className="text-slate-300">Viva Proof:</strong> PostgreSQL database accumulation across ingestion cycles (`select count(*)` backed).
          </div>
        </div>

        {/* 2. VELOCITY PANEL */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 hover:border-signal-500/40 transition-all flex flex-col justify-between bg-ink-900/80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-signal-500/15 flex items-center justify-center text-signal-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">2. VELOCITY</h3>
                  <span className="text-[11px] text-slate-400 font-mono">Stream Speed &amp; Freshness</span>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-signal-500/10 text-signal-400 border border-signal-500/30">
                <span className="w-2 h-2 rounded-full bg-signal-400 animate-pulse" />
                {velocity.pipelineStatus}
              </span>
            </div>

            <div className="space-y-3 my-4">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Ingestion Velocity:</span>
                <span className="font-bold text-signal-400 font-mono">{velocity.articlesPerMinute} art/min</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">End-to-End Latency:</span>
                <span className="font-bold text-white font-mono">{velocity.avgLatencyMs} ms</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">New Inserted Last Run:</span>
                <span className="font-bold text-pulse-400 font-mono">+{velocity.newArticlesLastRun}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Last Fetch Checkpoint:</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {velocity.timeSinceLastIngestionSec < 60 ? 'Just now' : `${Math.floor(velocity.timeSinceLastIngestionSec / 60)}m ago`}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-ink-800/60 text-[11px] text-slate-400">
            <strong className="text-slate-300">Viva Proof:</strong> Continuous ingestion pipeline running 60s background scheduler &amp; latency tracking.
          </div>
        </div>

        {/* 3. VARIETY PANEL */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 hover:border-gold-500/40 transition-all flex flex-col justify-between bg-ink-900/80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 flex items-center justify-center text-gold-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">3. VARIETY</h3>
                  <span className="text-[11px] text-slate-400 font-mono">Multi-Format News Data</span>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-1 rounded bg-ink-950 text-gold-300 border border-ink-800">
                {Object.keys(variety.providerCounts).length} Sources
              </span>
            </div>

            <div className="space-y-3 my-4">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Structured Data (DB):</span>
                <span className="font-bold text-white font-mono">{variety.structuredDbRecords}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Semi-Structured (JSON APIs):</span>
                <span className="font-bold text-gold-400 font-mono">{variety.semiStructuredJsonRecords}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Text Headlines &amp; Excerpts:</span>
                <span className="font-bold text-pulse-400 font-mono">{variety.textExcerptsCount}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Uploaded Datasets (CSV/JSON):</span>
                <span className="font-bold text-signal-400 font-mono">{variety.importedDatasetCount}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-ink-800/60 text-[11px] text-slate-400">
            <strong className="text-slate-300">Viva Proof:</strong> Multi-provider architecture (GDELT, GNews, Guardian, RSS &amp; File Importer).
          </div>
        </div>

        {/* 4. VERACITY PANEL */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 hover:border-emerald-500/40 transition-all flex flex-col justify-between bg-ink-900/80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">4. VERACITY</h3>
                  <span className="text-[11px] text-slate-400 font-mono">Data Quality &amp; Freshness</span>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Grade {veracity.qualityGrade}
              </span>
            </div>

            <div className="space-y-3 my-4">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Data Quality Score:</span>
                <span className="font-bold text-emerald-400 font-mono">{veracity.dataQualityScore}%</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Fresh Articles (&lt;1h):</span>
                <span className="font-bold text-emerald-400 font-mono">{veracity.freshnessBreakdown.fresh}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">Duplicates Filtered:</span>
                <span className="font-bold text-white font-mono">{veracity.duplicatesRemovedTotal}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-slate-400">URL Canonicalization Rate:</span>
                <span className="font-bold text-signal-400 font-mono">{veracity.validUrlRate}%</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-ink-800/60 text-[11px] text-slate-400">
            <strong className="text-slate-300">Viva Proof:</strong> Canonical URL param stripping, SHA-256 content deduplication &amp; UTC timestamps.
          </div>
        </div>

        {/* 5. VALUE PANEL */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 hover:border-flame-500/40 transition-all flex flex-col justify-between md:col-span-2 lg:col-span-2 bg-ink-900/80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-flame-500/15 flex items-center justify-center text-flame-400">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">5. VALUE</h3>
                  <span className="text-[11px] text-slate-400 font-mono">Actionable Intelligence &amp; NLP Insights</span>
                </div>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-flame-500/20 text-flame-300 border border-flame-500/30">
                {value.insightsGenerated} Active Insights
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4">
              <div className="p-3.5 rounded-xl bg-ink-950 border border-ink-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">Top Keywords</span>
                <span className="text-2xl font-bold text-white font-mono">{value.topKeywordsCount}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Extracted via TF-IDF</span>
              </div>

              <div className="p-3.5 rounded-xl bg-ink-950 border border-ink-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">Event Clusters</span>
                <span className="text-2xl font-bold text-pulse-400 font-mono">{value.activeEventClustersCount}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Grouped by text similarity</span>
              </div>

              <div className="p-3.5 rounded-xl bg-ink-950 border border-ink-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">Top Category</span>
                <span className="text-lg font-bold text-signal-400 truncate block">{value.topCategory}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Highest news volume</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-ink-800/60 text-[11px] text-slate-400">
            <strong className="text-slate-300">Viva Proof:</strong> Sentiment distribution, TF-IDF phrase extraction, category trend growth &amp; automated event clustering.
          </div>
        </div>

      </div>
    </div>
  );
}
