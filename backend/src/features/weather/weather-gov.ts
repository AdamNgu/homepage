import { env } from '../../config/env.js';
import type { UpstreamPeriod, UpstreamPoints } from './types.js';

const BASE_URL = 'https://api.weather.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

// api.weather.gov rejects coordinates with more than 4 decimals (HTTP 301).
export const truncateCoord = (value: number): string =>
  String(Number(value.toFixed(4)));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const requestOnce = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    headers: {
      // Required by api.weather.gov: requests without a User-Agent get a 403.
      'User-Agent': env.weatherUserAgent,
      Accept: 'application/geo+json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new UpstreamError(`weather.gov ${res.status} for ${url}`, res.status);
  }
  return res.json();
};

// One retry on 5xx/network errors: gridpoint endpoints intermittently 500.
const request = async (url: string): Promise<unknown> => {
  try {
    return await requestOnce(url);
  } catch (err) {
    if (err instanceof UpstreamError && err.status < 500) {
      throw err;
    }
    await sleep(RETRY_DELAY_MS);
    return requestOnce(url);
  }
};

export const getPoints = async (
  lat: string,
  lon: string,
): Promise<UpstreamPoints> => {
  const data = (await request(`${BASE_URL}/points/${lat},${lon}`)) as {
    properties: UpstreamPoints;
  };
  return data.properties;
};

export const getForecastPeriods = async (
  forecastUrl: string,
): Promise<UpstreamPeriod[]> => {
  const data = (await request(forecastUrl)) as {
    properties: { periods: UpstreamPeriod[] };
  };
  return data.properties.periods;
};
