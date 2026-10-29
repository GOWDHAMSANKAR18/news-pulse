import { useMemo, useState } from 'react';
import { 
  MapPin, 
  X, 
  Radio, 
  ExternalLink, 
  Globe, 
  Compass, 
  Layers, 
  Filter, 
  Search, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import type { NewsItem, Category, Sentiment, Urgency } from '../types';
import { timeAgo, urgencyConfig, categoryConfig } from '../uiConstants';
import { isValidCoordinatePair } from '../lib/pipeline/geoProcessor';

interface GeographicViewProps {
  news: NewsItem[];
}

// Projection helper: Equirectangular projection from Lat/Lng to SVG viewBox (0-100 x, 0-100 y)
function projectCoordinates(lat: number, lng: number): { x: number; y: number } {
  // Clamped to valid boundaries
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const clampedLng = Math.max(-180, Math.min(180, lng));

  const x = ((clampedLng + 180) / 360) * 100;
  const y = ((90 - clampedLat) / 180) * 100;

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

// Clustered map marker representation
interface MarkerCluster {
  id: string;
  x: number;
  y: number;
  items: NewsItem[];
  primaryTitle: string;
  count: number;
  locationName: string;
  isExact: boolean;
}

export default function GeographicView({ news }: GeographicViewProps) {
  const [mapMode, setMapMode] = useState<'world' | 'india'>('world');
  const [selectedCluster, setSelectedCluster] = useState<MarkerCluster | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [locationTypeFilter, setLocationTypeFilter] = useState<'all' | 'exact' | 'inferred'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Filter dataset according to user controls
  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      if (selectedCategory !== 'all' && item.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (selectedSentiment !== 'all' && item.sentiment.toLowerCase() !== selectedSentiment.toLowerCase()) {
        return false;
      }
      if (selectedCountry !== 'all') {
        const itemCountry = item.country?.toLowerCase() || '';
        if (itemCountry !== selectedCountry.toLowerCase()) return false;
      }
      if (locationTypeFilter === 'exact' && item.locationType !== 'exact') {
        return false;
      }
      if (locationTypeFilter === 'inferred' && item.locationType !== 'inferred') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesSource = item.source?.toLowerCase().includes(q);
        const matchesCountry = item.country?.toLowerCase().includes(q);
        const matchesRegion = item.region?.name?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSource && !matchesCountry && !matchesRegion) {
          return false;
        }
      }
      return true;
    });
  }, [news, selectedCategory, selectedSentiment, selectedCountry, locationTypeFilter, searchQuery]);

  // 2. Extract valid mappable records (Strict coordinate verification)
  const mappableArticles = useMemo(() => {
    return filteredNews.filter((item) => {
      const lat = item.latitude ?? item.region?.lat;
      const lng = item.longitude ?? item.region?.lng;
      if (lat === undefined || lng === undefined) return false;
      if (lat === null || lng === null) return false;
      if (!isValidCoordinatePair(lat, lng)) return false;
      if (lat === 0 && lng === 0 && item.locationType === 'unknown') return false;

      // In India regional mode, filter to coordinates within India bounding box (approx 6-36 lat, 68-98 lng)
      if (mapMode === 'india') {
        const isIndiaCountry = item.country?.toLowerCase() === 'india' || item.region?.id === 'india';
        const inIndiaBounds = lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
        return isIndiaCountry || inIndiaBounds;
      }

      return true;
    });
  }, [filteredNews, mapMode]);

  // 3. Cluster nearby markers into high-density buckets to prevent map freeze / clutter
  const clusters = useMemo(() => {
    const clusterMap: Record<string, MarkerCluster> = {};
    const clusterRadius = mapMode === 'world' ? 3.5 : 5.5; // percent grid distance

    mappableArticles.forEach((item) => {
      const lat = item.latitude ?? item.region?.lat ?? 0;
      const lng = item.longitude ?? item.region?.lng ?? 0;
      let pos = projectCoordinates(lat, lng);

      // In India view mode, scale India coordinates to fill SVG viewport
      if (mapMode === 'india') {
        const normX = Math.max(0, Math.min(100, ((lng - 68) / (98 - 68)) * 100));
        const normY = Math.max(0, Math.min(100, ((38 - lat) / (38 - 6)) * 100));
        pos = { x: Math.round(normX * 10) / 10, y: Math.round(normY * 10) / 10 };
      }

      // Find existing nearby cluster
      let foundKey: string | null = null;
      for (const [k, c] of Object.entries(clusterMap)) {
        const dx = c.x - pos.x;
        const dy = c.y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) <= clusterRadius) {
          foundKey = k;
          break;
        }
      }

      const locName = item.cityName || item.country || item.region?.name || 'Mappable Location';

      if (foundKey) {
        clusterMap[foundKey].items.push(item);
        clusterMap[foundKey].count++;
        if (item.locationType === 'exact') clusterMap[foundKey].isExact = true;
      } else {
        const key = `c-${pos.x.toFixed(1)}-${pos.y.toFixed(1)}`;
        clusterMap[key] = {
          id: key,
          x: pos.x,
          y: pos.y,
          items: [item],
          primaryTitle: item.title,
          count: 1,
          locationName: locName,
          isExact: item.locationType === 'exact',
        };
      }
    });

    return Object.values(clusterMap);
  }, [mappableArticles, mapMode]);

  // 4. Country & Location Statistics
  const countryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of filteredNews) {
      const c = item.country || (item.region?.id !== 'global' ? item.region?.name : 'International / Unknown');
      if (c) map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredNews]);

  const locationTypeStats = useMemo(() => {
    let exact = 0;
    let inferred = 0;
    let unknown = 0;
    for (const item of filteredNews) {
      if (item.locationType === 'exact') exact++;
      else if (item.locationType === 'inferred') inferred++;
      else unknown++;
    }
    return { exact, inferred, unknown };
  }, [filteredNews]);

  // Reset filters
  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedSentiment('all');
    setSelectedCountry('all');
    setLocationTypeFilter('all');
    setSearchQuery('');
    setSelectedCluster(null);
    setSelectedArticle(null);
  };

  return (
    <div className="space-y-6">
      {/* Header and View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-signal-400" />
            Geographic News Intelligence &amp; Hotspots
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Global coordinate mapping with real GPS validation, country normalization, and cluster inspection.
          </p>
        </div>

        {/* View Mode Toggle: World vs Regional India */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-ink-900 border border-ink-800 self-start sm:self-auto">
          <button
            onClick={() => { setMapMode('world'); setSelectedCluster(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mapMode === 'world'
                ? 'bg-signal-500 text-ink-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> World Map View
          </button>
          <button
            onClick={() => { setMapMode('india'); setSelectedCluster(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mapMode === 'india'
                ? 'bg-signal-500 text-ink-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> India Hotspots
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/90 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter by title or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-ink-950 border border-ink-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-signal-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-ink-950 border border-ink-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-signal-500"
            >
              <option value="all">All Categories</option>
              <option value="technology">Technology</option>
              <option value="business">Business</option>
              <option value="politics">Politics</option>
              <option value="sports">Sports</option>
              <option value="science">Science</option>
              <option value="health">Health</option>
              <option value="environment">Environment</option>
              <option value="world">World</option>
              <option value="india">India</option>
            </select>
          </div>

          {/* Sentiment Filter */}
          <div>
            <select
              value={selectedSentiment}
              onChange={(e) => setSelectedSentiment(e.target.value)}
              className="w-full bg-ink-950 border border-ink-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-signal-500"
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          {/* Location Precision Filter */}
          <div>
            <select
              value={locationTypeFilter}
              onChange={(e) => setLocationTypeFilter(e.target.value as 'all' | 'exact' | 'inferred')}
              className="w-full bg-ink-950 border border-ink-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-signal-500"
            >
              <option value="all">All Precision Levels</option>
              <option value="exact">Exact GPS Coordinates Only</option>
              <option value="inferred">Inferred Country / Region</option>
            </select>
          </div>

          {/* Reset Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilters}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 text-slate-300 text-xs font-semibold border border-ink-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
            </button>
          </div>
        </div>

        {/* Active Filter Indicators */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 flex-wrap font-mono">
          <span>Active Dataset: <strong className="text-white">{filteredNews.length}</strong> records</span>
          <span>·</span>
          <span>Mappable Coordinates: <strong className="text-signal-300">{mappableArticles.length}</strong></span>
          <span>·</span>
          <span>Map Clusters: <strong className="text-pulse-400">{clusters.length}</strong></span>
        </div>
      </div>

      {/* Main Map & Detail Splitter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Interactive Map Canvas Container */}
        <div className="lg:col-span-2 glass rounded-2xl p-6 border border-ink-700/50 relative overflow-hidden bg-ink-950">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-ink-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-signal-400 animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {mapMode === 'world' ? 'Global Mercator Projection Grid' : 'India Regional High-Density Hotspots'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Projection: {mapMode === 'world' ? 'Equirectangular 360° × 180°' : 'Regional EPSG:4326 Focus'}
            </span>
          </div>

          {/* Map Display Viewport */}
          <div className="relative aspect-[16/9] w-full bg-ink-900/90 rounded-xl border border-ink-800 overflow-hidden shadow-inner">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <defs>
                <pattern id="mapGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.2" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#mapGrid)" />

              {/* Equator and Prime Meridian Reference Lines */}
              <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(14, 165, 233, 0.15)" strokeWidth="0.4" strokeDasharray="1,1" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(14, 165, 233, 0.15)" strokeWidth="0.4" strokeDasharray="1,1" />

              {/* World Continents Contour Outlines (Global View) */}
              {mapMode === 'world' && (
                <g fill="rgba(30, 41, 59, 0.5)" stroke="rgba(71, 85, 105, 0.35)" strokeWidth="0.3">
                  {/* North America */}
                  <path d="M12 18 L24 14 L32 20 L28 35 L22 42 L18 36 L10 28 Z" />
                  {/* South America */}
                  <path d="M26 48 L35 50 L38 65 L32 82 L27 75 L24 58 Z" />
                  {/* Europe */}
                  <path d="M46 18 L58 16 L56 28 L48 30 L44 24 Z" />
                  {/* Africa */}
                  <path d="M45 34 L60 35 L62 55 L55 72 L47 70 L42 48 Z" />
                  {/* Asia */}
                  <path d="M60 16 L88 18 L86 42 L74 48 L65 35 L58 24 Z" />
                  {/* Australia */}
                  <path d="M78 62 L90 64 L88 78 L76 75 Z" />
                </g>
              )}

              {/* India Silhouette Contour (India Focus Mode) */}
              {mapMode === 'india' && (
                <path
                  d="M32 10 L45 8 L54 12 L62 10 L70 16 L72 25 L76 32 L74 40 L70 48 L72 58 L68 66 L62 70 L66 78 L62 86 L56 92 L52 98 L46 96 L42 90 L38 82 L32 76 L26 68 L22 60 L24 50 L22 40 L28 32 L26 24 Z"
                  fill="rgba(30, 41, 59, 0.6)"
                  stroke="rgba(14, 165, 233, 0.5)"
                  strokeWidth="0.5"
                />
              )}
            </svg>

            {/* Hotspot Markers / Clusters */}
            {clusters.map((cluster) => {
              const isSelected = selectedCluster?.id === cluster.id;
              const intensity = Math.min(1, cluster.count / 10);
              const size = intensity > 0.6 ? 26 : intensity > 0.3 ? 22 : 18;

              return (
                <button
                  key={cluster.id}
                  onClick={() => {
                    setSelectedCluster(cluster);
                    setSelectedArticle(cluster.items[0]);
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group transition-transform focus:outline-none z-10"
                  style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
                  title={`${cluster.locationName}: ${cluster.count} articles`}
                >
                  {/* Pulsing ring indicator */}
                  <span
                    className={`absolute inset-0 -m-1 rounded-full animate-ping opacity-30 ${
                      isSelected ? 'bg-signal-400' : cluster.isExact ? 'bg-emerald-400' : 'bg-pulse-400'
                    }`}
                    style={{ animationDuration: '2.5s' }}
                  />

                  {/* Marker Pin Badge */}
                  <span
                    className={`relative flex items-center justify-center rounded-full font-mono text-[10px] font-bold shadow-lg transition-all border ${
                      isSelected
                        ? 'bg-signal-500 text-ink-950 border-white scale-125 ring-2 ring-signal-400'
                        : cluster.isExact
                        ? 'bg-emerald-600/90 text-white border-emerald-400 group-hover:scale-110'
                        : 'bg-pulse-600/90 text-white border-pulse-400 group-hover:scale-110'
                    }`}
                    style={{ width: `${size}px`, height: `${size}px` }}
                  >
                    {cluster.count > 1 ? cluster.count : <MapPin className="w-2.5 h-2.5" />}
                  </span>

                  {/* Tooltip Label on Hover / Selection */}
                  <span
                    className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded-md pointer-events-none transition-all shadow-md ${
                      isSelected
                        ? 'bg-signal-500 text-ink-950 font-bold opacity-100 z-30'
                        : 'bg-ink-900/90 text-slate-300 border border-ink-700 opacity-0 group-hover:opacity-100 z-20'
                    }`}
                  >
                    {cluster.locationName} ({cluster.count})
                  </span>
                </button>
              );
            })}

            {/* Empty Mappable State */}
            {clusters.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-ink-950/80">
                <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-sm font-semibold text-white">No Mappable Articles in Filtered View</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Articles are available in the stream, but none match the current geographic, category, or coordinate filter.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-signal-500 text-ink-950 text-xs font-bold hover:bg-signal-400 transition-colors"
                >
                  Reset Active Filters
                </button>
              </div>
            )}
          </div>

          {/* Map Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-ink-800 text-xs text-slate-400 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-300" />
              <span>Exact GPS Coordinates</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-pulse-500 border border-pulse-300" />
              <span>Inferred Region / Country</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-signal-500 border border-white" />
              <span>Selected Cluster</span>
            </div>
            <div className="ml-auto text-[11px] text-slate-500 font-mono">
              Click any cluster marker to inspect articles
            </div>
          </div>
        </div>

        {/* Selected Cluster / Article Details Inspector */}
        <div className="glass rounded-2xl p-5 border border-ink-700/50 bg-ink-900/90 flex flex-col max-h-[640px]">
          {selectedCluster ? (
            <>
              {/* Cluster Header */}
              <div className="flex items-center justify-between pb-3 border-b border-ink-800 mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-signal-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedCluster.locationName}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {selectedCluster.items.length} Article{selectedCluster.items.length > 1 ? 's' : ''} in this area
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedCluster(null); setSelectedArticle(null); }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-ink-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cluster Articles List */}
              <div className="space-y-2.5 overflow-y-auto flex-1 pr-1 scrollbar-thin">
                {selectedCluster.items.map((art) => {
                  const isCurrent = selectedArticle?.id === art.id;
                  const u = urgencyConfig[art.urgency];
                  const c = categoryConfig[art.category];

                  return (
                    <div
                      key={art.id}
                      onClick={() => setSelectedArticle(art)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-ink-800/90 border-signal-500/60 ring-1 ring-signal-500/30'
                          : 'bg-ink-950/60 border-ink-800 hover:border-ink-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                          {art.category}
                        </span>
                        <span className={`text-[10px] font-bold ${u.text}`}>
                          Urgency: {art.urgencyScore}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-auto font-mono">
                          {timeAgo(art.timestamp)}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">
                        {art.title}
                      </h4>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink-800/50 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5" />
                          {art.source}
                        </span>
                        {art.url && (
                          <a
                            href={art.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-signal-400 hover:text-signal-300 flex items-center gap-0.5"
                          >
                            Read Article <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Article Metadata Footer */}
              {selectedArticle && (
                <div className="mt-3 pt-3 border-t border-ink-800 text-[11px] text-slate-400 space-y-1 bg-ink-950 p-2.5 rounded-lg font-mono">
                  <div className="flex items-center justify-between">
                    <span>Coordinates:</span>
                    <span className="text-white font-bold">
                      {selectedArticle.latitude?.toFixed(4) ?? selectedArticle.region?.lat?.toFixed(4) ?? '0.0000'}°N,{' '}
                      {selectedArticle.longitude?.toFixed(4) ?? selectedArticle.region?.lng?.toFixed(4) ?? '0.0000'}°E
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Precision:</span>
                    <span className={`font-semibold ${selectedArticle.locationType === 'exact' ? 'text-emerald-400' : 'text-pulse-400'}`}>
                      {selectedArticle.locationType?.toUpperCase() || 'INFERRED'}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-500">
              <MapPin className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-white mb-1">Select a Map Hotspot</p>
              <p className="text-xs text-slate-400 max-w-xs mb-4">
                Click any colored cluster or marker on the map to inspect breaking news stories from that region.
              </p>
              <div className="text-[11px] text-slate-500 font-mono">
                {clusters.length} active location clusters ready
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Country Distribution and Geographic Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Exact Coordinates */}
        <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/80">
          <div className="text-xs text-slate-400 font-medium">Exact Coordinates (GPS)</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
            {locationTypeStats.exact}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Directly verified latitude and longitude</p>
        </div>

        {/* Metric 2: Inferred Locations */}
        <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/80">
          <div className="text-xs text-slate-400 font-medium">Inferred Locations</div>
          <div className="text-2xl font-bold text-pulse-400 font-mono mt-1">
            {locationTypeStats.inferred}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Resolved via country or city centroids</p>
        </div>

        {/* Metric 3: Total Geographic Hotspots */}
        <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/80">
          <div className="text-xs text-slate-400 font-medium">Total Mapped Clusters</div>
          <div className="text-2xl font-bold text-signal-400 font-mono mt-1">
            {clusters.length}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Active coordinate density hubs</p>
        </div>

        {/* Metric 4: Top Country / Territory */}
        <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/80">
          <div className="text-xs text-slate-400 font-medium">Leading Geographic Origin</div>
          <div className="text-lg font-bold text-white truncate mt-1">
            {countryCounts[0]?.[0] || 'Global / Unknown'}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {countryCounts[0]?.[1] || 0} articles mapped
          </p>
        </div>
      </div>

      {/* Top Countries Summary Badges */}
      <div className="glass rounded-xl p-4 border border-ink-700/50 bg-ink-900/80 space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
          Top Geographic Distribution (Filtered Stream)
        </h3>
        <div className="flex flex-wrap gap-2 pt-1">
          {countryCounts.slice(0, 10).map(([country, count]) => (
            <button
              key={country}
              onClick={() => setSelectedCountry(selectedCountry === country ? 'all' : country)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                selectedCountry === country
                  ? 'bg-signal-500 text-ink-950 border-signal-400'
                  : 'bg-ink-950 text-slate-300 border-ink-800 hover:border-ink-700'
              }`}
            >
              {country} <span className="font-mono text-slate-400 ml-1">({count})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
