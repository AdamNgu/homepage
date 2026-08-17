// DTOs returned by GET /api/weather. Mirrored in
// frontend/src/features/weather/api/get-weather.ts — accepted duplication for
// one endpoint; a shared types package is not worth the coupling yet.
export type HourlyEntry = {
  time: string; // ISO8601 with local offset, from period.startTime
  temperature: number; // °F
  precipChance: number; // 0–100; upstream null coerced to 0
  iconCode: string; // slug from the icon URL, e.g. "rain_showers"
  isDaytime: boolean;
  shortForecast: string;
};

export type DailySummary = {
  high: number | null; // null when the first daily period is night-only ("Tonight")
  low: number | null;
  name: string;
  shortForecast: string;
};

export type LocationWeather = {
  label: string;
  isHome: boolean;
  timeZone: string;
  currentHumidity: number; // % — from hourly[0]; the daily endpoint has no humidity
  hourly: HourlyEntry[];
  today: DailySummary;
};

export type WeatherResponse = { locations: LocationWeather[] };

// Minimal shapes of the api.weather.gov payloads we consume.
export type UpstreamQuantity = { unitCode: string; value: number | null };

export type UpstreamPeriod = {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  name: string;
  shortForecast: string;
  icon: string;
  probabilityOfPrecipitation?: UpstreamQuantity;
  relativeHumidity?: UpstreamQuantity;
};

export type UpstreamPoints = {
  forecast: string;
  forecastHourly: string;
  timeZone: string;
};
