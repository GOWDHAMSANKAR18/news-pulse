import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { 
  Activity, 
  TrendingUp, 
  PieChart, 
  Layers, 
  Radio, 
  Clock, 
  Server, 
  Filter,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { 
  IngestionPoint, 
  EventCluster, 
  TopicGrowth, 
  ProviderHealth, 
  NewsItem 
} from '../types';
import type { SentimentBreakdown } from '../useNewsStream';
import type { SentimentReprocessStats } from '../lib/pipeline/sentimentAnalyzer';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

const baseGrid = { color: 'rgba(255, 255, 255, 0.05)' } as const;
const baseFont = { family: 'Inter', size: 11 } as const;

interface AnalyticsProps {
  news?: NewsItem[];
  ingestionHistory: IngestionPoint[];
  keywords: { keyword: string; count: number }[];
  sentiment: SentimentBreakdown;
  throughput: number;
  latency: number;
  eventClusters?: EventCluster[];
  topicGrowth?: TopicGrowth[];
  providerStatuses?: ProviderHealth[];
  fetchedCount?: number;
  insertedCount?: number;
  duplicatesCount?: number;
  rejectedCount?: number;
  onReprocessSentiment?: (options?: { forceRecompute?: boolean }) => Promise<SentimentReprocessStats>;
  isReprocessingSentiment?: boolean;
  lastReprocessStats?: SentimentReprocessStats | null;
}

function Card({ 
  title, 
  subtitle, 
  icon: Icon, 
  children,
  badge
}: { 
  title: string; 
  subtitle?: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl p-5 bg-black border border-neutral-800 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-white shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
            {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {badge && (
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
            {badge}
          </span>
        )}
      </div>
      <div className="h-60 relative w-full pt-1">{children}</div>
    </div>
  );
}

export default function Analytics({
  news = [],
  ingestionHistory,
  keywords,
  sentiment,
  throughput,
  latency,
  eventClusters = [],
  topicGrowth = [],
  providerStatuses = [],
  fetchedCount = 0,
  insertedCount = 0,
  duplicatesCount = 0,
  rejectedCount = 0,
  onReprocessSentiment,
  isReprocessingSentiment = false,
  lastReprocessStats = null,
}: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'6h' | '24h' | 'all'>('24h');
  const [sourceMetric, setSourceMetric] = useState<'publishers' | 'providers'>('publishers');

  // Chart A: Real Volume Over Time grouped by time range
  const volumeData: ChartData<'line'> = useMemo(() => {
    let points = ingestionHistory;
    if (timeRange === '6h') {
      points = ingestionHistory.slice(-6);
    }
    return {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: 'Articles Ingested',
          data: points.map((p) => p.count),
          borderColor: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    };
  }, [ingestionHistory, timeRange]);

  const volumeOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#000000',
        titleColor: '#ffffff',
        bodyColor: '#a3a3a3',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
    scales: {
      x: { grid: baseGrid, ticks: { color: '#737373', font: baseFont, maxTicksLimit: 8 } },
      y: { grid: baseGrid, ticks: { color: '#737373', font: baseFont }, beginAtZero: true },
    },
  };

  // Chart B: Category Distribution (Doughnut)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    news.forEach((n) => {
      counts[n.category] = (counts[n.category] || 0) + 1;
    });
    return counts;
  }, [news]);

  const categoryLabels = Object.keys(categoryCounts);
  const categoryValues = Object.values(categoryCounts);

  const categoryData: ChartData<'doughnut'> = {
    labels: categoryLabels.length > 0 ? categoryLabels : ['No Data'],
    datasets: [
      {
        data: categoryValues.length > 0 ? categoryValues : [1],
        backgroundColor: [
          '#ffffff',
          '#d4d4d4',
          '#a3a3a3',
          '#737373',
          '#525252',
          '#38bdf8',
          '#34d399',
          '#fbbf24',
          '#f87171',
        ],
        borderColor: '#000000',
        borderWidth: 2,
      },
    ],
  };

  const doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { 
        position: 'bottom', 
        labels: { color: '#a3a3a3', font: baseFont, padding: 8, boxWidth: 10 } 
      },
      tooltip: {
        backgroundColor: '#000000',
        titleColor: '#ffffff',
        bodyColor: '#a3a3a3',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
  };

  // Chart C: Source / Publisher Distribution (Bar)
  const sourceData: ChartData<'bar'> = useMemo(() => {
    const counts: Record<string, number> = {};
    news.forEach((n) => {
      const key = sourceMetric === 'publishers' ? n.source : n.provider;
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          label: sourceMetric === 'publishers' ? 'Publisher Articles' : 'Provider Articles',
          data: sorted.map((s) => s[1]),
          backgroundColor: '#525252',
          hoverBackgroundColor: '#ffffff',
          borderRadius: 4,
        },
      ],
    };
  }, [news, sourceMetric]);

  const barHorizontalOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#000000',
        titleColor: '#ffffff',
        bodyColor: '#a3a3a3',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
    scales: {
      x: { grid: baseGrid, ticks: { color: '#737373', font: baseFont } },
      y: { grid: { display: false }, ticks: { color: '#a3a3a3', font: baseFont } },
    },
  };

  // Chart D: Sentiment Breakdown (Rule-based keyword heuristic)
  const totalSentiment = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
  const sentimentData: ChartData<'doughnut'> = {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [
      {
        data: [sentiment.positive, sentiment.neutral, sentiment.negative],
        backgroundColor: ['#34d399', '#737373', '#f87171'],
        borderColor: '#000000',
        borderWidth: 3,
      },
    ],
  };

  // Chart E: Ingestion Activity (Fetched vs Inserted vs Duplicates vs Rejected)
  const ingestionActivityData: ChartData<'bar'> = {
    labels: ['Fetched Raw', 'Inserted Fresh', 'Duplicates Filtered', 'Rejected / Errors'],
    datasets: [
      {
        label: 'Recent Records',
        data: [fetchedCount, insertedCount, duplicatesCount, rejectedCount],
        backgroundColor: ['#ffffff', '#34d399', '#fbbf24', '#f87171'],
        borderRadius: 4,
      },
    ],
  };

  const activityBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#000000',
        titleColor: '#ffffff',
        bodyColor: '#a3a3a3',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#a3a3a3', font: baseFont } },
      y: { grid: baseGrid, ticks: { color: '#737373', font: baseFont }, beginAtZero: true },
    },
  };

  // Chart F: Provider Health Response Times & Status
  const providerChartData: ChartData<'bar'> = {
    labels: providerStatuses.map(p => p.name),
    datasets: [
      {
        label: 'Response Latency (ms)',
        data: providerStatuses.map(p => p.latencyMs || 0),
        backgroundColor: providerStatuses.map(p => 
          p.status === 'Healthy' ? '#34d399' : p.status === 'Degraded' ? '#fbbf24' : '#ef4444'
        ),
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-white" />
            Big Data Analytics &amp; NLP Visualizations
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Empirical measurements generated from live collected articles, exact PostgreSQL metrics, and VADER NLP vectors
          </p>
        </div>

        {onReprocessSentiment && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReprocessSentiment({ forceRecompute: true })}
              disabled={isReprocessingSentiment}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-sm"
              title="Reprocess all stored and live articles using VADER NLP engine"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isReprocessingSentiment ? 'animate-spin' : ''}`} />
              {isReprocessingSentiment ? 'Reprocessing NLP...' : 'Reprocess Sentiment'}
            </button>
          </div>
        )}
      </div>

      {/* Reprocessing Notification Banner */}
      {lastReprocessStats && (
        <div className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-neutral-300">
              VADER NLP Backfill Complete: <strong className="text-white">{lastReprocessStats.processed}</strong> articles re-scored ({lastReprocessStats.positiveCount} Positive, {lastReprocessStats.neutralCount} Neutral, {lastReprocessStats.negativeCount} Negative) in {lastReprocessStats.durationMs}ms
            </span>
          </div>
          <span className="text-[10px] text-neutral-500">vader-rule-engine-v1</span>
        </div>
      )}

      {/* KPI Highlights Bar (5 Metric Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Throughput Rate</span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">{throughput}</span>
          <span className="text-[10px] text-neutral-400">articles / min</span>
        </div>
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Pipeline Latency</span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">{latency}</span>
          <span className="text-[10px] text-neutral-400">ms execution</span>
        </div>
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Positive Sentiment</span>
          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
            {totalSentiment > 0 ? ((sentiment.positive / totalSentiment) * 100).toFixed(0) : 0}%
          </span>
          <span className="text-[10px] text-neutral-400">{sentiment.positive} articles</span>
        </div>
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Neutral Sentiment</span>
          <span className="text-2xl font-bold font-mono text-neutral-300 mt-1 block">
            {totalSentiment > 0 ? ((sentiment.neutral / totalSentiment) * 100).toFixed(0) : 0}%
          </span>
          <span className="text-[10px] text-neutral-400">{sentiment.neutral} articles</span>
        </div>
        <div className="p-3.5 rounded-xl bg-black border border-neutral-800 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">Negative Sentiment</span>
          <span className="text-2xl font-bold font-mono text-rose-400 mt-1 block">
            {totalSentiment > 0 ? ((sentiment.negative / totalSentiment) * 100).toFixed(0) : 0}%
          </span>
          <span className="text-[10px] text-neutral-400">{sentiment.negative} articles</span>
        </div>
      </div>

      {/* 6 Responsive Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* A. News volume over time */}
        <div className="rounded-2xl p-5 bg-black border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-white" />
              <div>
                <h3 className="text-sm font-semibold text-white">A. News Volume Over Time</h3>
                <p className="text-[11px] text-neutral-400">Grouped into 1-hour UTC buckets</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-[10px]">
              {(['6h', '24h', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-2 py-0.5 rounded font-mono ${
                    timeRange === r ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="h-60 relative w-full">
            <Line data={volumeData} options={volumeOptions} />
          </div>
        </div>

        {/* B. Category distribution */}
        <Card 
          title="B. Category Distribution" 
          subtitle="Topical partitioning across stored articles" 
          icon={PieChart}
          badge={`${categoryLabels.length} categories`}
        >
          <Doughnut data={categoryData} options={doughnutOptions} />
        </Card>

        {/* C. Source & Provider distribution */}
        <div className="rounded-2xl p-5 bg-black border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-white" />
              <div>
                <h3 className="text-sm font-semibold text-white">C. Distribution by Source</h3>
                <p className="text-[11px] text-neutral-400">
                  {sourceMetric === 'publishers' ? 'Counting original news publishers' : 'Counting ingestion provider adapters'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-[10px]">
              <button
                onClick={() => setSourceMetric('publishers')}
                className={`px-2 py-0.5 rounded ${
                  sourceMetric === 'publishers' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400'
                }`}
              >
                Publishers
              </button>
              <button
                onClick={() => setSourceMetric('providers')}
                className={`px-2 py-0.5 rounded ${
                  sourceMetric === 'providers' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400'
                }`}
              >
                Adapters
              </button>
            </div>
          </div>
          <div className="h-60 relative w-full">
            <Bar data={sourceData} options={barHorizontalOptions} />
          </div>
        </div>

        {/* D. Sentiment analysis */}
        <Card 
          title="D. Sentiment Analysis" 
          subtitle="Classified via VADER Compound Scoring (-1.0 to +1.0)" 
          icon={Activity}
          badge="VADER NLP"
        >
          <Doughnut data={sentimentData} options={doughnutOptions} />
        </Card>

        {/* E. Ingestion activity */}
        <Card 
          title="E. Ingestion Activity Metrics" 
          subtitle="Records fetched, inserted, skipped, and rejected" 
          icon={Clock}
          badge="Pipeline Engine"
        >
          <Bar data={ingestionActivityData} options={activityBarOptions} />
        </Card>

        {/* F. Provider health & latency */}
        <Card 
          title="F. News Provider Health & Latency" 
          subtitle="Response duration in ms across providers" 
          icon={Radio}
          badge={`${providerStatuses.filter(p => p.status === 'Healthy').length} / ${providerStatuses.length} Healthy`}
        >
          <Bar data={providerChartData} options={activityBarOptions} />
        </Card>
      </div>

      {/* TF-IDF Keywords & NLP Event Clusters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
        {/* Top Keywords */}
        <div className="rounded-2xl p-5 bg-black border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white" />
            <h3 className="text-sm font-semibold text-white">Top TF-IDF Keywords Extracted</h3>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {keywords.map((kw) => (
              <span 
                key={kw.keyword} 
                className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-900 text-neutral-300 border border-neutral-800"
              >
                #{kw.keyword} <strong className="text-white ml-1 font-sans">({kw.count})</strong>
              </span>
            ))}
          </div>
        </div>

        {/* NLP Event Clusters */}
        <div className="rounded-2xl p-5 bg-black border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-white" />
            <h3 className="text-sm font-semibold text-white">Active NLP Event Clusters (Jaccard Grouped)</h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {eventClusters.slice(0, 4).map((cluster) => (
              <div key={cluster.id} className="p-3 rounded-xl bg-neutral-950 border border-neutral-900 text-xs">
                <div className="flex items-center justify-between text-neutral-400">
                  <span className="font-semibold text-white">{cluster.name}</span>
                  <span className="font-mono text-[11px]">{cluster.articleCount} articles</span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-1">
                  Sources: {cluster.topSources.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Topic Growth Trends if present */}
      {topicGrowth.length > 0 && (
        <div className="rounded-2xl p-5 bg-black border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Rising Topic Growth</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topicGrowth.slice(0, 4).map((tg) => (
              <div key={tg.topic} className="p-3 rounded-xl bg-neutral-950 border border-neutral-900 text-xs">
                <span className="text-neutral-400 block truncate">{tg.topic}</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  +{tg.growthRatePct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
