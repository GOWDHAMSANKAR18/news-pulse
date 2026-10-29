import React from 'react';
import { 
  LayoutDashboard, 
  Newspaper, 
  BarChart3, 
  Radio, 
  Zap, 
  Database, 
  Archive, 
  Map, 
  Activity,
  Globe2,
} from 'lucide-react';
import type { AppDataState } from '../types';

export type TabId = 
  | 'overview' 
  | 'live' 
  | 'analytics' 
  | 'providers' 
  | 'fiveVs' 
  | 'import' 
  | 'historical' 
  | 'geo' 
  | 'globalExplorer'
  | 'system';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live', label: 'Live News', icon: Newspaper },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'providers', label: 'Provider Health', icon: Radio },
  { id: 'fiveVs', label: '5 Vs of Big Data', icon: Zap },
  { id: 'historical', label: 'Historical News', icon: Archive },
  { id: 'import', label: 'Data Import', icon: Database },
  { id: 'geo', label: 'Geographic', icon: Map },
  { id: 'globalExplorer', label: 'Global News Explorer', icon: Globe2 },
  { id: 'system', label: 'System Monitor', icon: Activity },
];

interface NavBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  liveCount: number;
  dataState?: AppDataState;
}

export default function NavBar({ active, onChange, liveCount, dataState = 'LIVE' }: NavBarProps) {
  const stateBadgeColor = {
    LIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 dot:bg-emerald-400',
    STALE: 'bg-amber-500/15 text-amber-300 border-amber-500/40 dot:bg-amber-400',
    HISTORICAL: 'bg-sky-500/15 text-sky-300 border-sky-500/40 dot:bg-sky-400',
    DEMO: 'bg-purple-500/15 text-purple-300 border-purple-500/40 dot:bg-purple-400',
    ERROR: 'bg-rose-500/15 text-rose-300 border-rose-500/40 dot:bg-rose-400',
  }[dataState];

  return (
    <header className="sticky top-0 z-50 glass border-b border-ink-700/60 backdrop-blur-xl bg-black/90">
      <div className="max-w-[1700px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-black border border-neutral-700 flex items-center justify-center shadow-lg">
                <Newspaper className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-black animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-wider leading-none">
                NEWS<span className="text-white">PULSE</span>
              </h1>
              <p className="text-[10px] text-neutral-400 font-mono tracking-widest leading-none mt-1 uppercase">
                Big Data Intelligence
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden xl:flex items-center gap-1 bg-black/80 rounded-xl p-1 border border-neutral-800">
            {TABS.map((tab) => {
              const isActive = active === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Status & Live Counter Badges */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 5-State Data Model Badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono border ${stateBadgeColor}`}>
              <span className={`w-2 h-2 rounded-full ${
                dataState === 'LIVE' ? 'bg-emerald-400 animate-pulse' :
                dataState === 'STALE' ? 'bg-amber-400' :
                dataState === 'HISTORICAL' ? 'bg-sky-400' :
                dataState === 'DEMO' ? 'bg-purple-400' : 'bg-rose-400'
              }`} />
              <span>{dataState}</span>
            </div>

            {/* Articles In Memory / View Counter */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
              <span className="text-[11px] text-neutral-400 font-medium">Articles:</span>
              <span className="font-bold font-mono text-white tabular-nums">{liveCount}</span>
            </div>
          </div>
        </div>

        {/* Mobile / Compact Responsive Navigation */}
        <nav className="xl:hidden flex items-center gap-1 pb-2.5 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive 
                    ? 'bg-neutral-800 text-white border border-neutral-700' 
                    : 'text-neutral-400 bg-neutral-950 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
