import React, { useState } from 'react';
import { 
  AlertCircle, 
  RefreshCw, 
  Stethoscope, 
  Archive, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle 
} from 'lucide-react';
import type { ProviderHealth } from '../types';
import type { DiagnosticResult } from '../lib/providers/providerManager';
import { timeAgo } from '../uiConstants';

interface ProviderStatusNoticeProps {
  error: string | null;
  providerStatuses: ProviderHealth[];
  lastSuccessFetchTime: number | string | null;
  totalDbStoredCount: number;
  autoRefreshIntervalSeconds: number;
  loading: boolean;
  onRefresh: () => void;
  onViewHistorical?: () => void;
  onRunDiagnostics?: () => Promise<DiagnosticResult[]>;
}

export default function ProviderStatusNotice({
  error,
  providerStatuses,
  lastSuccessFetchTime,
  totalDbStoredCount,
  autoRefreshIntervalSeconds,
  loading,
  onRefresh,
  onViewHistorical,
  onRunDiagnostics,
}: ProviderStatusNoticeProps) {
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsResults, setDiagnosticsResults] = useState<DiagnosticResult[] | null>(null);

  const handleRunDiagnostics = async () => {
    if (!onRunDiagnostics || diagnosticsRunning) return;
    setDiagnosticsRunning(true);
    try {
      const results = await onRunDiagnostics();
      setDiagnosticsResults(results);
    } catch {
      // Handled internally
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  const getRefreshText = () => {
    if (autoRefreshIntervalSeconds <= 0) return 'Paused';
    if (autoRefreshIntervalSeconds === 60) return 'In ~1 minute';
    if (autoRefreshIntervalSeconds === 300) return 'In ~5 minutes';
    if (autoRefreshIntervalSeconds === 600) return 'In ~10 minutes';
    return `In ~${autoRefreshIntervalSeconds} seconds`;
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header Banner */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide text-white font-mono uppercase">
              NO NEW ARTICLES RETRIEVED
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              The latest ingestion attempt did not produce any fresh articles.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Retry Now
          </button>

          {onRunDiagnostics && (
            <button
              onClick={handleRunDiagnostics}
              disabled={diagnosticsRunning}
              className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Stethoscope className={`w-3.5 h-3.5 text-sky-400 ${diagnosticsRunning ? 'animate-pulse' : ''}`} />
              {diagnosticsRunning ? 'Running...' : 'Run Diagnostics'}
            </button>
          )}

          {onViewHistorical && (
            <button
              onClick={onViewHistorical}
              className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5 text-amber-400" />
              View Historical News
            </button>
          )}
        </div>
      </div>

      {/* Provider Diagnostics Grid */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-neutral-400 tracking-wider uppercase font-mono">
          Provider Diagnostics
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {providerStatuses.map((p) => {
            const isOnline = p.status === 'Healthy';
            return (
              <div 
                key={p.name} 
                className="p-3 rounded-xl bg-black border border-neutral-800 flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">{p.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    p.status === 'Healthy' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : p.status === 'Degraded' 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : p.status === 'Rate Limited'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      : p.status === 'Fetched Zero Articles'
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 truncate" title={p.lastError || (isOnline ? 'Endpoint responsive' : 'Not configured / offline')}>
                  {p.status === 'Rate Limited' && p.retryAfterSeconds && p.retryAfterSeconds > 0
                    ? `Cooldown active — retry after ${p.retryAfterSeconds}s`
                    : p.lastError ? p.lastError : isOnline ? 'Endpoint responsive' : 'Not configured / offline'}
                </p>
                <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono pt-0.5 border-t border-neutral-900">
                  <span>Latency: {p.latencyMs ? `${p.latencyMs}ms` : '—'}</span>
                  <span>Fetched: {p.totalFetched} {p.validArticles !== undefined ? `(${p.validArticles} valid)` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metadata Telemetry Row */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1 text-xs text-neutral-400 border-t border-neutral-800/80 font-mono">
        <div>
          Last successful ingestion:{' '}
          <strong className="text-white">
            {lastSuccessFetchTime ? timeAgo(lastSuccessFetchTime) : 'Never'}
          </strong>
        </div>
        <div>
          Stored historical articles:{' '}
          <strong className="text-white">{totalDbStoredCount} in PostgreSQL</strong>
        </div>
        <div>
          Next automatic refresh:{' '}
          <strong className="text-white">{getRefreshText()}</strong>
        </div>
        <button
          onClick={() => setShowErrorDetails(!showErrorDetails)}
          className="text-neutral-400 hover:text-white flex items-center gap-1 text-xs underline decoration-neutral-700 underline-offset-4"
        >
          {showErrorDetails ? 'Hide Error Details' : 'View Error Details'}
          {showErrorDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expandable Error Details Panel */}
      {showErrorDetails && (
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800 font-mono text-xs text-neutral-300 space-y-2">
          <div className="flex items-center gap-2 text-rose-400 font-semibold text-[11px]">
            <AlertCircle className="w-3.5 h-3.5" />
            Last Execution Message:
          </div>
          <p className="text-neutral-400 bg-neutral-950 p-2.5 rounded-lg border border-neutral-900 break-words">
            {error || 'No unhandled exception logged. Ingestion cycles completed without new unique records.'}
          </p>
          <div className="text-[11px] text-neutral-500 space-y-1">
            <p>• Historical articles remain stored in PostgreSQL and fully searchable.</p>
            <p>• Free news endpoints (GDELT / RSS) enforce rate limits; automatic polling will retry safely on the next interval.</p>
          </div>
        </div>
      )}

      {/* Diagnostics Results Modal/Inline Banner */}
      {diagnosticsResults && (
        <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-sky-900/50 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5" />
              Live Diagnostic Verification Report
            </span>
            <button
              onClick={() => setDiagnosticsResults(null)}
              className="text-[11px] text-neutral-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {diagnosticsResults.map((r, i) => (
              <div key={i} className="p-2.5 rounded bg-black/60 border border-neutral-800 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{r.provider}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    r.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                    r.status === 'DEGRADED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                    'bg-neutral-800 text-neutral-400'
                  }`}>
                    {r.status}
                  </span>
                </div>
                <p className="text-neutral-400 truncate">{r.message}</p>
                <div className="text-neutral-500 text-[10px] flex justify-between">
                  <span>Latency: {r.latencyMs}ms</span>
                  <span>Articles: {r.articlesRetrieved}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
