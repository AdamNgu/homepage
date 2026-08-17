import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pointsPayload = (gridPath: string) => ({
  properties: {
    forecast: `https://api.weather.gov/gridpoints/${gridPath}/forecast`,
    forecastHourly: `https://api.weather.gov/gridpoints/${gridPath}/forecast/hourly`,
    timeZone: 'America/New_York',
    relativeLocation: { properties: { city: 'New York', state: 'NY' } },
  },
});

const hourlyPayload = {
  properties: {
    periods: Array.from({ length: 30 }, (_, i) => ({
      startTime: `2026-08-16T${String(i % 24).padStart(2, '0')}:00:00-04:00`,
      isDaytime: true,
      temperature: 80,
      name: '',
      shortForecast: 'Sunny',
      icon: 'https://api.weather.gov/icons/land/day/skc?size=small',
      probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 15 },
      relativeHumidity: { unitCode: 'wmoUnit:percent', value: 68 },
    })),
  },
};

const dailyPayload = {
  properties: {
    periods: [
      {
        startTime: '2026-08-16T06:00:00-04:00',
        isDaytime: true,
        temperature: 84,
        name: 'Today',
        shortForecast: 'Sunny',
        icon: 'https://api.weather.gov/icons/land/day/skc?size=small',
      },
      {
        startTime: '2026-08-16T18:00:00-04:00',
        isDaytime: false,
        temperature: 71,
        name: 'Tonight',
        shortForecast: 'Clear',
        icon: 'https://api.weather.gov/icons/land/night/skc?size=small',
      },
    ],
  },
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/geo+json' },
  });

const routeFetch = (url: string): Response => {
  if (url.includes('/points/')) {
    return jsonResponse(pointsPayload('OKX/33,35'));
  }
  if (url.includes('/forecast/hourly')) {
    return jsonResponse(hourlyPayload);
  }
  return jsonResponse(dailyPayload);
};

// env is read at module load, so each test resets modules and stubs env first.
const loadService = async () => {
  vi.resetModules();
  return import('./service.js');
};

describe('getWeather', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => routeFetch(String(url))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns only the home location when home is inside NYC', async () => {
    const { getWeather } = await loadService();
    const { locations } = await getWeather();

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      label: 'Brooklyn, NY 11201',
      isHome: true,
      currentHumidity: 68,
      today: { high: 84, low: 71 },
    });
    expect(locations[0]?.hourly).toHaveLength(24);
    expect(locations[0]?.hourly[0]).toMatchObject({
      temperature: 80,
      precipChance: 15,
      iconCode: 'skc',
    });
  });

  it('appends NYC when home is outside the NYC bounding box', async () => {
    vi.stubEnv('HOME_LAT', '34.0549');
    vi.stubEnv('HOME_LON', '-118.2426');
    vi.stubEnv('HOME_LABEL', 'Los Angeles, CA');

    const { getWeather } = await loadService();
    const { locations } = await getWeather();

    expect(locations.map((l) => l.label)).toEqual([
      'Los Angeles, CA',
      'New York, NY',
    ]);
    expect(locations.map((l) => l.isHome)).toEqual([true, false]);
  });

  it('retries once when weather.gov returns a 5xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockImplementation(async (url: string | URL) => routeFetch(String(url)));
    vi.stubGlobal('fetch', fetchMock);

    const { getWeather } = await loadService();
    const { locations } = await getWeather();

    expect(locations).toHaveLength(1);
    // 1 failed points call + retry + hourly + daily
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
