import React, { useState } from 'react';
import { 
  Upload, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Database, 
  Cpu, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  FileCode,
  Layers,
  ShieldAlert
} from 'lucide-react';
import type { QuarantineRecord } from '../lib/pipeline/varietyParsers';

export interface ImportReport {
  formatDetected: string;
  totalEvaluated: number;
  parsedCount: number;
  importedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  insertedCount: number;
  dbStoredCount: number;
  dbWriteError: string | null;
  quarantinedRecords: QuarantineRecord[];
  errors: string[];
}

interface DataImportViewProps {
  onRunVolumeTest: (count: number) => { count: number; executionTimeMs: number; storageKb: number };
  onImportDataset: (content: string, format?: 'json' | 'csv' | 'auto') => Promise<ImportReport> | ImportReport;
}

export default function DataImportView({ onRunVolumeTest, onImportDataset }: DataImportViewProps) {
  const [testCount, setTestCount] = useState<number>(1000);
  const [benchmarkResult, setBenchmarkResult] = useState<{ count: number; executionTimeMs: number; storageKb: number } | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showQuarantineDetails, setShowQuarantineDetails] = useState<boolean>(false);
  const [importedFileName, setImportedFileName] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportedFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const result = await onImportDataset(content, 'auto');
        setImportReport(result);
      } catch (err) {
        setImportReport({
          formatDetected: 'unknown',
          totalEvaluated: 0,
          parsedCount: 0,
          importedCount: 0,
          validCount: 0,
          invalidCount: 1,
          duplicateCount: 0,
          insertedCount: 0,
          dbStoredCount: 0,
          dbWriteError: null,
          quarantinedRecords: [{ row: 1, reason: String(err) }],
          errors: [`Failed to read file: ${String(err)}`],
        });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleRunStressTest = () => {
    const res = onRunVolumeTest(testCount);
    setBenchmarkResult(res);
  };

  const handleDownloadErrorReport = () => {
    if (!importReport) return;
    const reportData = {
      fileName: importedFileName,
      timestamp: new Date().toISOString(),
      summary: {
        formatDetected: importReport.formatDetected,
        totalEvaluated: importReport.totalEvaluated,
        validIngested: importReport.importedCount,
        quarantined: importReport.invalidCount,
        duplicates: importReport.duplicateCount,
        dbStored: importReport.dbStoredCount,
      },
      quarantinedRecords: importReport.quarantinedRecords,
      allErrors: importReport.errors,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-validation-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-pulse-400" />
          Data Import &amp; Batch Processing Benchmarks
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Demonstrate Volume &amp; Variety with volume stress benchmarks or importing multi-format JSON, NDJSON, and CSV datasets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Section 1: Volume Stress Test Generator */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 space-y-4 bg-ink-900/80">
          <div className="flex items-center gap-2 text-pulse-400">
            <Cpu className="w-5 h-5" />
            <h3 className="text-base font-semibold text-white">1. Volume Stress Test Benchmarker</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Generate and ingest synthetic news records to benchmark batch processing execution time and storage memory scaling without polluting real news data.
          </p>

          <div className="space-y-3 pt-2">
            <label className="text-xs text-slate-400 block font-medium">Record Volume Batch Size:</label>
            <div className="flex items-center gap-3">
              {[500, 1000, 2500, 5000].map(cnt => (
                <button
                  key={cnt}
                  onClick={() => setTestCount(cnt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    testCount === cnt
                      ? 'bg-pulse-500/20 text-pulse-300 border border-pulse-500/40'
                      : 'bg-ink-950 text-slate-400 hover:text-slate-200 border border-ink-800'
                  }`}
                >
                  {cnt.toLocaleString()} Records
                </button>
              ))}
            </div>

            <button
              onClick={handleRunStressTest}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-pulse-500 hover:bg-pulse-400 text-ink-950 font-bold text-sm shadow-md transition-all"
            >
              <Play className="w-4 h-4 fill-current" /> Execute Volume Benchmark
            </button>
          </div>

          {benchmarkResult && (
            <div className="p-4 rounded-xl bg-ink-950 border border-pulse-500/30 space-y-2 text-xs animate-fade-in">
              <div className="flex items-center gap-1.5 text-pulse-300 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Benchmark Complete
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px]">Records:</span>
                  <span className="text-white font-bold">{benchmarkResult.count}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Execution:</span>
                  <span className="text-signal-400 font-bold">{benchmarkResult.executionTimeMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Storage Size:</span>
                  <span className="text-gold-400 font-bold">{benchmarkResult.storageKb} KB</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Universal CSV / JSON / NDJSON File Import */}
        <div className="glass rounded-2xl p-6 border border-ink-700/50 space-y-4 bg-ink-900/80">
          <div className="flex items-center gap-2 text-signal-400">
            <Upload className="w-5 h-5" />
            <h3 className="text-base font-semibold text-white">2. Multi-Format External Dataset Import</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Auto-detects and ingests standard JSON Arrays, JSON Objects (`articles`, `data`), JSON Lines (NDJSON), and CSV with RFC 4180 quote support.
          </p>

          <div className="border-2 border-dashed border-ink-800 rounded-xl p-6 text-center hover:border-signal-500/50 transition-colors bg-ink-950">
            <FileCode className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-medium mb-1">Click to Upload JSON, NDJSON, or CSV file</p>
            <p className="text-[11px] text-slate-500 mb-3">
              Supports standard &amp; custom schemas (title, description, url, source, country, coordinates)
            </p>
            <input
              type="file"
              accept=".json,.jsonl,.ndjson,.csv,.txt"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-signal-500/20 file:text-signal-300 hover:file:bg-signal-500/30 cursor-pointer disabled:opacity-50"
            />
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-ink-950 border border-signal-500/30 text-xs text-signal-300 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing &amp; validating dataset records...
            </div>
          )}

          {/* Import Processing Results Card */}
          {importReport && !isProcessing && (
            <div className="p-4 rounded-xl bg-ink-950 border border-ink-700/60 space-y-3 text-xs animate-fade-in">
              {/* Header Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {importReport.importedCount > 0 ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-4 h-4" /> Import Complete
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-rose-400 font-bold">
                      <ShieldAlert className="w-4 h-4" /> Ingestion Notice (0 Valid Records)
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-ink-800 text-slate-300">
                  Format: {importReport.formatDetected.toUpperCase()}
                </span>
              </div>

              {/* Exact Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="p-2 rounded bg-ink-900 border border-ink-800">
                  <span className="text-slate-400 block text-[10px]">Evaluated:</span>
                  <span className="text-white font-bold">{importReport.totalEvaluated.toLocaleString()}</span>
                </div>
                <div className="p-2 rounded bg-ink-900 border border-ink-800">
                  <span className="text-slate-400 block text-[10px]">Valid &amp; Ingested:</span>
                  <span className="text-emerald-400 font-bold">{importReport.importedCount.toLocaleString()}</span>
                </div>
                <div className="p-2 rounded bg-ink-900 border border-ink-800">
                  <span className="text-slate-400 block text-[10px]">Quarantined:</span>
                  <span className="text-rose-400 font-bold">{importReport.invalidCount.toLocaleString()}</span>
                </div>
                <div className="p-2 rounded bg-ink-900 border border-ink-800">
                  <span className="text-slate-400 block text-[10px]">PostgreSQL Synced:</span>
                  <span className="text-sky-400 font-bold">{importReport.dbStoredCount.toLocaleString()}</span>
                </div>
              </div>

              {/* DB Write Error notice if present */}
              {importReport.dbWriteError && (
                <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Database write notice: {importReport.dbWriteError} (Cached in memory fallback)</span>
                </div>
              )}

              {/* Quarantined Records Accordion & Download */}
              {importReport.quarantinedRecords.length > 0 && (
                <div className="pt-2 border-t border-ink-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowQuarantineDetails(!showQuarantineDetails)}
                      className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white font-medium"
                    >
                      {showQuarantineDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {importReport.quarantinedRecords.length} Quarantined Rows (Click to Inspect)
                    </button>
                    <button
                      onClick={handleDownloadErrorReport}
                      className="flex items-center gap-1 text-[11px] text-signal-400 hover:text-signal-300 font-semibold"
                    >
                      <Download className="w-3 h-3" /> Export Audit Log
                    </button>
                  </div>

                  {showQuarantineDetails && (
                    <div className="max-h-48 overflow-y-auto rounded-lg bg-ink-900 p-2.5 border border-ink-800 text-[11px] space-y-1.5 font-mono scrollbar-thin">
                      {importReport.quarantinedRecords.slice(0, 30).map((q, idx) => (
                        <div key={idx} className="pb-1 border-b border-ink-800/60 last:border-0">
                          <span className="text-rose-400 font-bold">Row {q.row}:</span>{' '}
                          <span className="text-slate-300">{q.reason}</span>
                          {q.rawSample && (
                            <span className="text-slate-500 block text-[10px] truncate">{q.rawSample}</span>
                          )}
                        </div>
                      ))}
                      {importReport.quarantinedRecords.length > 30 && (
                        <div className="text-slate-500 text-[10px] pt-1">
                          ...and {importReport.quarantinedRecords.length - 30} more quarantined rows (exported in audit log)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
