import { env } from '../../config/env.js';
import { getCached } from '../../lib/redis.js';
import { toLocationWeather } from './mapper.js';
import { isInsideNyc, NYC_FALLBACK } from './nyc.js';
import type { LocationWeather, WeatherResponse } from './types.js';
import { getForecastPeriods, getPoints, truncateCoord } from './weather-gov.js';

// Fixed TTLs instead of honoring upstream Cache-Control: 10 minutes is polite
// to weather.gov and fresh enough for a morning glance; parsing max-age would
// mean plumbing response headers through the cache layer for no visible gain.
const POINTS_TTL_SECONDS = 86_400;
const FORECAST_TTL_SECONDS = 600;

type LocationConfig = {
  lat: number;
  lon: number;
  label: string;
  isHome: boolean;
};

const configuredLocations = (): LocationConfig[] => {
  const home = {
    lat: env.homeLat,
    lon: env.homeLon,
    label: env.homeLabel,
    isHome: true,
  };
  return isInsideNyc(home) ? [home] : [home, { ...NYC_FALLBACK, isHome: false }];
};

const getLocationWeather = async (
  location: LocationConfig,
): Promise<LocationWeather> => {
  const lat = truncateCoord(location.lat);
  const lon = truncateCoord(location.lon);
  const coordsKey = `${lat},${lon}`;

  const points = await getCached(
    `wx:points:${coordsKey}`,
    POINTS_TTL_SECONDS,
    () => getPoints(lat, lon),
  );
  const [hourlyPeriods, dailyPeriods] = await Promise.all([
    getCached(`wx:hourly:${coordsKey}`, FORECAST_TTL_SECONDS, () =>
      getForecastPeriods(points.forecastHourly),
    ),
    getCached(`wx:daily:${coordsKey}`, FORECAST_TTL_SECONDS, () =>
      getForecastPeriods(points.forecast),
    ),
  ]);

  return toLocationWeather(location, points, hourlyPeriods, dailyPeriods);
};

export const getWeather = async (): Promise<WeatherResponse> => ({
  locations: await Promise.all(configuredLocations().map(getLocationWeather)),
});
