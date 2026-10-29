import { Zap } from 'lucide-react';
import type { NewsItem } from '../types';
import { timeAgo } from '../uiConstants';

interface BreakingNewsTickerProps {
  breaking: NewsItem[];
}

export default function BreakingNewsTicker({ breaking }: BreakingNewsTickerProps) {
  if (breaking.length === 0) return null;
  const items = breaking.slice(0, 6);
  const doubled = [...items, ...items];

  return (
    <div className="relative bg-gradient-to-r from-flame-600 via-flame-500 to-gold-500 border-b border-flame-600/40 overflow-hidden">
      <div className="flex items-center">
        <div className="flex items-center gap-2 px-4 py-2 bg-ink-950/30 z-10 shrink-0">
          <Zap className="w-4 h-4 text-gold-400 animate-flash" />
          <span className="text-xs font-bold text-white tracking-wider">BREAKING</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-ticker whitespace-nowrap">
            {doubled.map((item, i) => (
              <span
                key={`${item.id}-${i}`}
                className="inline-flex items-center gap-2 px-6 py-2 text-sm text-white font-medium"
              >
                <span className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                {item.title}
                <span className="text-white/60 text-xs ml-1">{timeAgo(item.timestamp)}</span>
                <span className="text-white/30 mx-2">|</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
