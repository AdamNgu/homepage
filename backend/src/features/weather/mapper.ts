import type {
  DailySummary,
  HourlyEntry,
  LocationWeather,
  UpstreamPeriod,
  UpstreamPoints,
} from './types.js';

const HOURLY_COUNT = 24;

// "https://api.weather.gov/icons/land/day/rain_showers,50?size=small" → "rain_showers"
export const extractIconCode = (iconUrl: string): string =>
  /\/land\/(?:day|night)\/([a-z_]+)/.exec(iconUrl)?.[1] ?? 'unknown';

export const toHourlyEntries = (periods: UpstreamPeriod[]): HourlyEntry[] =>
  periods.slice(0, HOURLY_COUNT).map((period) => ({
    time: period.startTime,
    temperature: period.temperature,
    precipChance: period.probabilityOfPrecipitation?.value ?? 0,
    iconCode: extractIconCode(period.icon),
    isDaytime: period.isDaytime,
    shortForecast: period.shortForecast,
  }));

// Daily forecast comes as day/night half-day pairs. The first period can be a
// night-only partial ("Tonight"), in which case today has no high.
export const toDailySummary = (periods: UpstreamPeriod[]): DailySummary => {
  const [first, second] = periods;
  if (first === undefined) {
    return { high: null, low: null, name: '', shortForecast: '' };
  }
  if (!first.isDaytime) {
    return {
      high: null,
      low: first.temperature,
      name: first.name,
      shortForecast: first.shortForecast,
    };
  }
  return {
    high: first.temperature,
    low: second?.temperature ?? null,
    name: first.name,
    shortForecast: first.shortForecast,
  };
};

export const toLocationWeather = (
  location: { label: string; isHome: boolean },
  points: UpstreamPoints,
  hourlyPeriods: UpstreamPeriod[],
  dailyPeriods: UpstreamPeriod[],
  now: Date,
): LocationWeather => ({
  label: location.label,
  isHome: location.isHome,
  timeZone: points.timeZone,
  updatedAt: now.toISOString(),
  currentHumidity: hourlyPeriods[0]?.relativeHumidity?.value ?? 0,
  hourly: toHourlyEntries(hourlyPeriods),
  today: toDailySummary(dailyPeriods),
});
