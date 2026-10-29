import { Zap, Clock, Radio, MapPin, ExternalLink, ShieldCheck } from 'lucide-react';
import type { NewsItem } from '../types';
import { timeAgo, urgencyConfig, sentimentConfig, categoryConfig } from '../uiConstants';

interface NewsCardProps {
  item: NewsItem;
}

export default function NewsCard({ item }: NewsCardProps) {
  const u = urgencyConfig[item.urgency] || urgencyConfig.low;
  const s = sentimentConfig[item.sentiment] || sentimentConfig.Neutral;
  const c = categoryConfig[item.category] || categoryConfig.Tech;
  const isGlobal = item.region.id === 'global';

  // Freshness Badge Config
  const freshnessConfig = {
    Fresh: { label: 'FRESH', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    Delayed: { label: 'DELAYED', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
    Stale: { label: 'STALE', bg: 'bg-neutral-800 text-neutral-400 border-neutral-700', dot: 'bg-neutral-400' },
    Unknown: { label: 'UNKNOWN', bg: 'bg-neutral-800 text-neutral-400 border-neutral-700', dot: 'bg-neutral-400' },
  }[item.freshnessStatus || 'Fresh'];

  // Origin Badge Config
  const origin = item.isSynthetic 
    ? 'DEMO' 
    : (item.origin === 'historical' ? 'STORED' : (item.origin === 'imported' ? 'IMPORT' : 'LIVE'));

  const originBadgeStyle = {
    DEMO: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    STORED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    IMPORT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    LIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  }[origin];

  return (
    <article className="rounded-xl p-4 transition-all duration-200 group flex flex-col justify-between bg-black border border-neutral-800 hover:border-neutral-700 hover:shadow-lg hover:shadow-white/5">
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category Badge */}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${c.bg} ${c.text}`}>
              {item.category}
            </span>

            {/* Freshness Badge */}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${freshnessConfig.bg} inline-flex items-center gap-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${freshnessConfig.dot} ${item.freshnessStatus === 'Fresh' ? 'animate-pulse' : ''}`} />
              {freshnessConfig.label}
            </span>

            {/* Origin Badge (LIVE / STORED / DEMO / IMPORT) */}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${originBadgeStyle}`}>
              {origin}
            </span>

            {/* Provider Badge */}
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">
              {item.provider}
            </span>
          </div>

          {(item.urgency === 'critical' || item.urgency === 'high') && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${u.bg} ${u.text} inline-flex items-center gap-1 shrink-0`}>
              <Zap className="w-2.5 h-2.5" />
              {u.label}
            </span>
          )}
        </div>

        {/* Headline */}
        <h3 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-neutral-200 transition-colors">
          <a 
            href={item.url || item.canonicalUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:underline flex items-start gap-1"
          >
            <span>{item.title}</span>
            <ExternalLink className="w-3 h-3 text-neutral-500 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        </h3>

        {item.description && item.description !== item.title && (
          <p className="text-xs text-neutral-400 leading-snug line-clamp-2 mb-3">
            {item.description}
          </p>
        )}

        {/* Badges: Location & Quality Score */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${
            isGlobal ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-800 text-neutral-300'
          }`}>
            <MapPin className="w-2.5 h-2.5 text-neutral-400" />
            {item.region.name}
          </span>

          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${s.bg} ${s.text} inline-flex items-center gap-1`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {item.sentiment}
          </span>

          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
            QS: {item.qualityScore}%
          </span>
        </div>
      </div>

      <div>
        {/* Urgency Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Urgency Score</span>
            <span className={`text-[10px] font-bold tabular-nums ${u.text}`}>{item.urgencyScore}</span>
          </div>
          <div className="h-1 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
            <div
              className={`h-full ${u.bar} rounded-full transition-all duration-500`}
              style={{ width: `${item.urgencyScore}%` }}
            />
          </div>
        </div>

        {/* Footer info: Source + Exact Publication Time */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 border-t border-neutral-900 pt-2.5">
          <div className="flex items-center gap-1.5 truncate max-w-[140px]">
            <Radio className="w-3 h-3 text-neutral-400 shrink-0" />
            <span className="truncate text-neutral-300 font-medium">{item.source}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-neutral-400 font-mono">
            <Clock className="w-3 h-3 text-neutral-400" />
            <span>{timeAgo(item.timestamp)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
