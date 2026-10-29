import { useState } from 'react';
import { 
  Server, 
  Terminal, 
  Radio, 
  CheckCircle2, 
  Play, 
  Loader2
} from 'lucide-react';
import type { PipelineStatus, LogEntry, ProviderHealth, DataQualityReport } from '../types';
import type { DiagnosticResult } from '../lib/providers/providerManager';

interface SystemMonitorProps {
  pipeline: PipelineStatus;
  logs: LogEntry[];
  providers?: ProviderHealth[];
  qualityReport?: DataQualityReport;
  onRunDiagnostics?: () => Promise<DiagnosticResult[]>;
}

export default function SystemMonitor({ 
  pipeline, 
  logs, 
  providers = [], 
  qualityReport,
  onRunDiagnostics 
}: SystemMonitorProps) {
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticsOutput, setDiagnosticsOutput] = useState<DiagnosticResult[] | null>(null);

  const handleDiagnostics = async () => {
    if (!onRunDiagnostics) return;
    setRunningDiagnostics(true);
    try {
      const results = await onRunDiagnostics();
      setDiagnosticsOutput(results);
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const newestArticleAgeMin = Math.floor(Math.max(0, Date.now() - (pipeline.newestArticleTimestamp || Date.now())) / 60000);
  const timeSinceLastIngestionSec = Math.floor(Math.max(0, Date.now() - (pipeline.lastSuccessCollectionTime || Date.now())) / 1000);

  return (
    <div className="space-y-6">
      {/* Header and Diagnostics Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-white" />
            System Monitor &amp; Provider Health
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real-time API endpoints, PostgreSQL connection health, Big Data runtime statuses, and structured error logs
          </p>
        </div>

        {onRunDiagnostics && (
          <button
            onClick={handleDiagnostics}
            disabled={runningDiagnostics}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all disabled:opacity-50 shrink-0 shadow-sm"
          >
            {runningDiagnostics ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            Run System Diagnostics
          </button>
        )}
      </div>

      {/* Diagnostics Output Panel if executed */}
      {diagnosticsOutput && (
        <div className="rounded-xl p-4 bg-neutral-950 border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Diagnostics Outcome Report
            </h3>
            <span className="text-[11px] text-neutral-400 font-mono">
              Tested {diagnosticsOutput.length} targets
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {diagnosticsOutput.map((d) => (
              <div key={d.provider} className="p-3 rounded-lg bg-black border border-neutral-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{d.provider}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    d.status === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                    d.status === 'DEGRADED' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                    'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }`}>
                    {d.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 line-clamp-2">{d.message}</p>
                {d.latencyMs > 0 && (
                  <span className="text-[10px] text-neutral-500 font-mono block">Latency: {d.latencyMs}ms</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Freshness Checkpoint Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-black border border-neutral-800">
        <div>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Latest Fetch Status</span>
          <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
            {timeSinceLastIngestionSec < 60 ? 'Just now' : `${Math.floor(timeSinceLastIngestionSec / 60)}m ago`}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Newest Published Article</span>
          <span className="text-sm font-bold text-white font-mono mt-0.5 block">
            {newestArticleAgeMin < 60 ? `${newestArticleAgeMin}m ago` : `${(newestArticleAgeMin / 60).toFixed(1)}h ago`}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Fresh Stream Articles</span>
          <span className="text-sm font-bold text-white font-mono mt-0.5 block">
            {pipeline.freshnessBreakdown?.fresh || 0} items (&lt;60m)
          </span>
        </div>
        <div>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Quality Score (Veracity)</span>
          <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
            {qualityReport?.averageQualityScore || 90}% ({qualityReport?.qualityGrade || 'A'})
          </span>
        </div>
      </div>

      {/* Provider Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map((p) => {
          const isHealthy = p.status === 'Healthy';
          const isDegraded = p.status === 'Degraded';
          return (
            <div 
              key={p.name} 
              className="rounded-xl p-4 bg-black border border-neutral-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className={`w-4 h-4 ${isHealthy ? 'text-emerald-400' : isDegraded ? 'text-amber-400' : 'text-neutral-500'}`} />
                  <div>
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-[10px] text-neutral-400 font-mono">{p.totalFetched} fetched</div>
                  </div>
                </div>
                <span className={`w-2 h-2 rounded-full ${
                  isHealthy ? 'bg-emerald-400 animate-pulse' : 
                  isDegraded ? 'bg-amber-400' : 
                  p.status === 'Rate Limited' ? 'bg-purple-400' :
                  p.status === 'Fetched Zero Articles' ? 'bg-sky-400' :
                  'bg-neutral-600'
                }`} />
              </div>

              <div className="text-xs space-y-1.5 pt-1 border-t border-neutral-900">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Status:</span>
                  <span className={`font-semibold font-mono text-[11px] px-1.5 py-0.5 rounded ${
                    isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    isDegraded ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                    p.status === 'Rate Limited' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                    p.status === 'Fetched Zero Articles' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                    'bg-neutral-800 text-neutral-400'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-neutral-400">HTTP & Latency:</span>
                  <span className="font-mono text-neutral-300">
                    {p.httpStatus ? `HTTP ${p.httpStatus}` : '—'} · {p.latencyMs ? `${p.latencyMs}ms` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-neutral-400">Last Success:</span>
                  <span className="font-mono text-neutral-300">
                    {p.lastSuccessTime ? new Date(p.lastSuccessTime).toLocaleTimeString() : 'Pending'}
                  </span>
                </div>
                {(p.validArticles !== undefined || p.duplicateArticles !== undefined) && (
                  <div className="flex justify-between text-[10px] text-neutral-400 font-mono bg-neutral-950 p-1.5 rounded border border-neutral-900">
                    <span>Valid: <strong className="text-emerald-400">{p.validArticles ?? 0}</strong></span>
                    <span>Dups: <strong className="text-amber-400">{p.duplicateArticles ?? 0}</strong></span>
                    <span>Synced: <strong className="text-sky-400">{p.insertedArticles ?? 0}</strong></span>
                  </div>
                )}
                {p.nextEligibleTime && p.nextEligibleTime > Date.now() ? (
                  <div className="text-[10px] text-purple-400 font-mono bg-purple-950/30 px-1.5 py-0.5 rounded border border-purple-800/40">
                    Cooldown active: {Math.max(0, Math.ceil((p.nextEligibleTime - Date.now()) / 1000))}s remaining
                  </div>
                ) : p.lastError ? (
                  <p className="text-[10px] text-amber-400/90 pt-1 border-t border-neutral-900 truncate" title={p.lastError}>
                    Notice: {p.lastError}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Apache Spark & Apache Kafka Runtime Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Apache Spark Engine */}
        <div className="rounded-xl p-5 bg-black border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 font-bold font-mono text-xs">
                ⚡
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Apache Spark (PySpark Analytics)</h4>
                <p className="text-[11px] text-neutral-400">Micro-batch aggregations &amp; TF-IDF ML vectorization</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              Script Mode
            </span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Analytics scripts run via Python runtime (<code className="text-white font-mono text-[11px]">scripts/spark_news_analytics.py</code>). 
            Outputs batch JSON/Parquet summaries to <code className="text-neutral-300 font-mono text-[11px]">data/spark_output/spark_summary.json</code>.
          </p>
        </div>

        {/* Apache Kafka Streaming */}
        <div className="rounded-xl p-5 bg-black border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-sky-400 font-bold font-mono text-xs">
                📡
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Apache Kafka (Event Stream)</h4>
                <p className="text-[11px] text-neutral-400">Topic: <code className="font-mono text-white text-[11px]">news-raw-stream</code></p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
              Embedded Engine
            </span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Streaming producer and consumer engine operates via <code className="text-white font-mono text-[11px]">scripts/kafka_news_producer_consumer.py</code>. 
            Connects to local broker on port 9092 when active, falling back to embedded queue with committed offsets.
          </p>
        </div>
      </div>

      {/* Live Structured Logs Terminal */}
      <div className="rounded-xl p-5 bg-black border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-white" />
            <h3 className="text-sm font-semibold text-white">Live Ingestion &amp; Diagnostic Logs</h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">
            {logs.length} events logged
          </span>
        </div>

        <div className="font-mono text-xs bg-neutral-950 p-4 rounded-xl border border-neutral-900 max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin">
          {logs.length === 0 ? (
            <p className="text-neutral-600">No events logged yet.</p>
          ) : (
            logs.map((log) => {
              const isError = log.level === 'ERROR';
              const isWarn = log.level === 'WARN';
              return (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed text-[11px]">
                  <span className="text-neutral-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-1 py-0.2 rounded font-bold shrink-0 ${
                    isError ? 'bg-rose-950 text-rose-400' :
                    isWarn ? 'bg-amber-950 text-amber-400' :
                    'bg-neutral-900 text-neutral-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-neutral-500 shrink-0">[{log.source}]</span>
                  <span className={isError ? 'text-rose-300' : isWarn ? 'text-amber-200' : 'text-neutral-300'}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
