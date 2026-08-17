import { queryOptions, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

// Mirrors backend/src/features/weather/types.ts (accepted duplication).
export type HourlyEntry = {
  time: string;
  temperature: number;
  precipChance: number;
  iconCode: string;
  isDaytime: boolean;
  shortForecast: string;
};

export type DailySummary = {
  high: number | null;
  low: number | null;
  name: string;
  shortForecast: string;
};

export type LocationWeather = {
  label: string;
  isHome: boolean;
  timeZone: string;
  currentHumidity: number;
  hourly: HourlyEntry[];
  today: DailySummary;
};

export type WeatherResponse = { locations: LocationWeather[] };

const getWeather = () => apiClient<WeatherResponse>('/api/weather');

export const weatherQueryOptions = () =>
  queryOptions({
    queryKey: ['weather'],
    queryFn: getWeather,
    refetchInterval: 10 * 60 * 1000,
  });

export const useWeather = () => useQuery(weatherQueryOptions());
