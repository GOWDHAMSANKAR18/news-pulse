import type { Urgency, Sentiment, Category } from './types';

export function timeAgo(ts?: number | string | null): string {
  if (ts === null || ts === undefined) return 'Unknown';
  const num = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (isNaN(num) || num <= 0) return 'Unknown';
  const diff = Math.max(0, Date.now() - num);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const urgencyConfig: Record<Urgency, { label: string; bar: string; text: string; bg: string }> = {
  critical: { label: 'CRITICAL', bar: 'bg-flame-500', text: 'text-flame-400', bg: 'bg-flame-500/10 border-flame-500/30' },
  high: { label: 'HIGH', bar: 'bg-gold-500', text: 'text-gold-400', bg: 'bg-gold-500/10 border-gold-500/30' },
  medium: { label: 'MEDIUM', bar: 'bg-signal-500', text: 'text-signal-400', bg: 'bg-signal-500/10 border-signal-500/30' },
  low: { label: 'LOW', bar: 'bg-pulse-500', text: 'text-pulse-400', bg: 'bg-pulse-500/10 border-pulse-500/30' },
};

export const sentimentConfig: Record<Sentiment, { text: string; bg: string; dot: string }> = {
  Positive: { text: 'text-pulse-400', bg: 'bg-pulse-500/15', dot: 'bg-pulse-400' },
  Neutral: { text: 'text-slate-300', bg: 'bg-slate-500/15', dot: 'bg-slate-400' },
  Negative: { text: 'text-flame-400', bg: 'bg-flame-500/15', dot: 'bg-flame-400' },
};

export const categoryConfig: Record<Category, { text: string; bg: string }> = {
  Technology: { text: 'text-signal-400', bg: 'bg-signal-500/15' },
  Tech: { text: 'text-signal-400', bg: 'bg-signal-500/15' },
  Politics: { text: 'text-gold-400', bg: 'bg-gold-500/15' },
  Business: { text: 'text-pulse-400', bg: 'bg-pulse-500/15' },
  Finance: { text: 'text-pulse-400', bg: 'bg-pulse-500/15' },
  Sports: { text: 'text-flame-400', bg: 'bg-flame-500/15' },
  World: { text: 'text-purple-400', bg: 'bg-purple-500/15' },
  India: { text: 'text-orange-400', bg: 'bg-orange-500/15' },
  Science: { text: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  Health: { text: 'text-rose-400', bg: 'bg-rose-500/15' },
  Environment: { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  General: { text: 'text-slate-300', bg: 'bg-slate-500/15' },
};
