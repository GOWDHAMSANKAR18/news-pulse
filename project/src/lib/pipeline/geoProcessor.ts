/**
 * Geographic Normalization and Coordinate Validation Engine
 * 
 * Provides:
 * - Strict latitude [-90, 90] and longitude [-180, 180] validation
 * - Standardized ISO country code and country name mapping
 * - City / Region centroid resolution for inferred locations
 * - Clear distinction: 'exact' (provided GPS) vs 'inferred' (from country/city) vs 'unknown'
 * - Zero fabrication of coordinates when location cannot be determined
 */

export type LocationType = 'exact' | 'inferred' | 'unknown';

export interface GeoLocation {
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  countryCode: string | null;
  regionId: string;
  regionName: string;
  cityName: string | null;
  locationType: LocationType;
  rawLocation?: string | null;
}

// Standard country centroid lookup (latitude, longitude, ISO-2, ISO-3)
interface CountryInfo {
  name: string;
  iso2: string;
  iso3: string;
  lat: number;
  lng: number;
}

const COUNTRY_REGISTRY: Record<string, CountryInfo> = {
  'india': { name: 'India', iso2: 'IN', iso3: 'IND', lat: 20.5937, lng: 78.9629 },
  'united states': { name: 'United States', iso2: 'US', iso3: 'USA', lat: 37.0902, lng: -95.7129 },
  'united kingdom': { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', lat: 55.3781, lng: -3.4360 },
  'germany': { name: 'Germany', iso2: 'DE', iso3: 'DEU', lat: 51.1657, lng: 10.4515 },
  'france': { name: 'France', iso2: 'FR', iso3: 'FRA', lat: 46.2276, lng: 2.2137 },
  'japan': { name: 'Japan', iso2: 'JP', iso3: 'JPN', lat: 36.2048, lng: 138.2529 },
  'china': { name: 'China', iso2: 'CN', iso3: 'CHN', lat: 35.8617, lng: 104.1954 },
  'australia': { name: 'Australia', iso2: 'AU', iso3: 'AUS', lat: -25.2744, lng: 133.7751 },
  'canada': { name: 'Canada', iso2: 'CA', iso3: 'CAN', lat: 56.1304, lng: -106.3468 },
  'brazil': { name: 'Brazil', iso2: 'BR', iso3: 'BRA', lat: -14.2350, lng: -51.9253 },
  'russia': { name: 'Russia', iso2: 'RU', iso3: 'RUS', lat: 61.5240, lng: 105.3188 },
  'south africa': { name: 'South Africa', iso2: 'ZA', iso3: 'ZAF', lat: -30.5595, lng: 22.9375 },
  'singapore': { name: 'Singapore', iso2: 'SG', iso3: 'SGP', lat: 1.3521, lng: 103.8198 },
  'uae': { name: 'United Arab Emirates', iso2: 'AE', iso3: 'ARE', lat: 23.4241, lng: 53.8478 },
  'italy': { name: 'Italy', iso2: 'IT', iso3: 'ITA', lat: 41.8719, lng: 12.5674 },
  'spain': { name: 'Spain', iso2: 'ES', iso3: 'ESP', lat: 40.4637, lng: -3.7492 },
  'south korea': { name: 'South Korea', iso2: 'KR', iso3: 'KOR', lat: 35.9078, lng: 127.7669 },
  'mexico': { name: 'Mexico', iso2: 'MX', iso3: 'MEX', lat: 23.6345, lng: -102.5528 },
  'switzerland': { name: 'Switzerland', iso2: 'CH', iso3: 'CHE', lat: 46.8182, lng: 8.2275 },
  'israel': { name: 'Israel', iso2: 'IL', iso3: 'ISR', lat: 31.0461, lng: 34.8516 },
  'ukraine': { name: 'Ukraine', iso2: 'UA', iso3: 'UKR', lat: 48.3794, lng: 31.1656 },
};

// Aliases mapping to canonical keys
const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'united states',
  'usa': 'united states',
  'u.s.': 'united states',
  'u.s.a.': 'united states',
  'uk': 'united kingdom',
  'gbr': 'united kingdom',
  'great britain': 'united kingdom',
  'britain': 'united kingdom',
  'england': 'united kingdom',
  'in': 'india',
  'ind': 'india',
  'bharat': 'india',
  'de': 'germany',
  'deu': 'germany',
  'fr': 'france',
  'fra': 'france',
  'jp': 'japan',
  'jpn': 'japan',
  'cn': 'china',
  'chn': 'china',
  'au': 'australia',
  'aus': 'australia',
  'ca': 'canada',
  'can': 'canada',
  'br': 'brazil',
  'bra': 'brazil',
  'ru': 'russia',
  'rus': 'russia',
  'za': 'south africa',
  'zaf': 'south africa',
  'sg': 'singapore',
  'sgp': 'singapore',
  'ae': 'uae',
  'are': 'uae',
  'dubai': 'uae',
  'it': 'italy',
  'ita': 'italy',
  'es': 'spain',
  'esp': 'spain',
  'kr': 'south korea',
  'kor': 'south korea',
  'korea': 'south korea',
  'mx': 'mexico',
  'mex': 'mexico',
  'ch': 'switzerland',
  'che': 'switzerland',
  'il': 'israel',
  'isr': 'israel',
  'ua': 'ukraine',
  'ukr': 'ukraine',
};

// Recognized major city hubs
const CITY_REGISTRY: Record<string, { name: string; country: string; lat: number; lng: number; regionId: string }> = {
  'delhi': { name: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090, regionId: 'delhi' },
  'new delhi': { name: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090, regionId: 'delhi' },
  'mumbai': { name: 'Mumbai', country: 'India', lat: 19.0760, lng: 72.8777, regionId: 'mumbai' },
  'bombay': { name: 'Mumbai', country: 'India', lat: 19.0760, lng: 72.8777, regionId: 'mumbai' },
  'bengaluru': { name: 'Bengaluru', country: 'India', lat: 12.9716, lng: 77.5946, regionId: 'bengaluru' },
  'bangalore': { name: 'Bengaluru', country: 'India', lat: 12.9716, lng: 77.5946, regionId: 'bengaluru' },
  'kolkata': { name: 'Kolkata', country: 'India', lat: 22.5726, lng: 88.3639, regionId: 'kolkata' },
  'calcutta': { name: 'Kolkata', country: 'India', lat: 22.5726, lng: 88.3639, regionId: 'kolkata' },
  'chennai': { name: 'Chennai', country: 'India', lat: 13.0827, lng: 80.2707, regionId: 'chennai' },
  'madras': { name: 'Chennai', country: 'India', lat: 13.0827, lng: 80.2707, regionId: 'chennai' },
  'hyderabad': { name: 'Hyderabad', country: 'India', lat: 17.3850, lng: 78.4867, regionId: 'hyderabad' },
  'london': { name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, regionId: 'london' },
  'new york': { name: 'New York', country: 'United States', lat: 40.7128, lng: -74.0060, regionId: 'new_york' },
  'san francisco': { name: 'San Francisco', country: 'United States', lat: 37.7749, lng: -122.4194, regionId: 'san_francisco' },
  'washington': { name: 'Washington D.C.', country: 'United States', lat: 38.9072, lng: -77.0369, regionId: 'washington' },
  'tokyo': { name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, regionId: 'tokyo' },
  'paris': { name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522, regionId: 'paris' },
  'berlin': { name: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050, regionId: 'berlin' },
  'sydney': { name: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093, regionId: 'sydney' },
};

/**
 * Validates whether latitude and longitude numbers are strictly valid GPS coordinates.
 */
export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // (0,0) is Null Island - treat only as valid if explicitly set and not accidental default
  return true;
}

/**
 * Normalizes any country string into standard name, ISO codes, and centroid.
 */
export function normalizeCountry(rawCountry?: string | null): CountryInfo | null {
  if (!rawCountry || typeof rawCountry !== 'string') return null;
  const cleaned = rawCountry.trim().toLowerCase();
  if (!cleaned) return null;

  const resolvedKey = COUNTRY_ALIASES[cleaned] || cleaned;
  return COUNTRY_REGISTRY[resolvedKey] || null;
}

/**
 * Processes input fields to create a reliable, normalized GeoLocation.
 */
export function processGeographicData(input: {
  lat?: unknown;
  lng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country?: unknown;
  countryCode?: unknown;
  city?: unknown;
  region?: unknown;
  location?: unknown;
  headlineOrTitle?: string;
}): GeoLocation {
  // 1. Check for explicit valid coordinate pair
  const rawLat = input.latitude ?? input.lat;
  const rawLng = input.longitude ?? input.lng;
  const parsedLat = typeof rawLat === 'string' ? parseFloat(rawLat) : typeof rawLat === 'number' ? rawLat : NaN;
  const parsedLng = typeof rawLng === 'string' ? parseFloat(rawLng) : typeof rawLng === 'number' ? rawLng : NaN;

  if (isValidCoordinatePair(parsedLat, parsedLng) && !(parsedLat === 0 && parsedLng === 0)) {
    // If coordinates are exact, determine best country/region name
    const country = typeof input.country === 'string' ? input.country : null;
    const countryInfo = normalizeCountry(country);
    return {
      latitude: parsedLat,
      longitude: parsedLng,
      country: countryInfo?.name || country || null,
      countryCode: countryInfo?.iso2 || (typeof input.countryCode === 'string' ? input.countryCode : null),
      regionId: typeof input.region === 'string' ? input.region.toLowerCase() : 'custom_coord',
      regionName: typeof input.city === 'string' ? input.city : countryInfo?.name || 'Exact Coordinates',
      cityName: typeof input.city === 'string' ? input.city : null,
      locationType: 'exact',
    };
  }

  // 2. Check for explicit city/location string
  const cityCandidate = String(input.city || input.location || '').trim().toLowerCase();
  if (cityCandidate && CITY_REGISTRY[cityCandidate]) {
    const city = CITY_REGISTRY[cityCandidate];
    const countryInfo = normalizeCountry(city.country);
    return {
      latitude: city.lat,
      longitude: city.lng,
      country: city.country,
      countryCode: countryInfo?.iso2 || null,
      regionId: city.regionId,
      regionName: city.name,
      cityName: city.name,
      locationType: 'inferred',
      rawLocation: cityCandidate,
    };
  }

  // 3. Check for explicit country string
  const countryCandidate = String(input.country || input.countryCode || '').trim().toLowerCase();
  const matchedCountry = normalizeCountry(countryCandidate);
  if (matchedCountry) {
    const isIndia = matchedCountry.iso2 === 'IN';
    return {
      latitude: matchedCountry.lat,
      longitude: matchedCountry.lng,
      country: matchedCountry.name,
      countryCode: matchedCountry.iso2,
      regionId: isIndia ? 'india' : matchedCountry.iso2.toLowerCase(),
      regionName: matchedCountry.name,
      cityName: null,
      locationType: 'inferred',
      rawLocation: countryCandidate,
    };
  }

  // 4. Scan title/headline for known cities/countries if provided
  if (input.headlineOrTitle) {
    const lowerTitle = input.headlineOrTitle.toLowerCase();
    for (const [cityKey, cityInfo] of Object.entries(CITY_REGISTRY)) {
      const regex = new RegExp(`\\b${cityKey}\\b`, 'i');
      if (regex.test(lowerTitle)) {
        const countryInfo = normalizeCountry(cityInfo.country);
        return {
          latitude: cityInfo.lat,
          longitude: cityInfo.lng,
          country: cityInfo.country,
          countryCode: countryInfo?.iso2 || null,
          regionId: cityInfo.regionId,
          regionName: cityInfo.name,
          cityName: cityInfo.name,
          locationType: 'inferred',
          rawLocation: cityKey,
        };
      }
    }

    for (const [countryKey, countryInfo] of Object.entries(COUNTRY_REGISTRY)) {
      const regex = new RegExp(`\\b${countryKey}\\b`, 'i');
      if (regex.test(lowerTitle)) {
        return {
          latitude: countryInfo.lat,
          longitude: countryInfo.lng,
          country: countryInfo.name,
          countryCode: countryInfo.iso2,
          regionId: countryInfo.iso2 === 'IN' ? 'india' : countryInfo.iso2.toLowerCase(),
          regionName: countryInfo.name,
          cityName: null,
          locationType: 'inferred',
          rawLocation: countryKey,
        };
      }
    }
  }

  // 5. Unknown Location: Preserved without fabricating coordinates
  return {
    latitude: null,
    longitude: null,
    country: null,
    countryCode: null,
    regionId: 'global',
    regionName: 'Global / Unknown',
    cityName: null,
    locationType: 'unknown',
  };
}
