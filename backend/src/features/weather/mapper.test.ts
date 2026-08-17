import { describe, expect, it } from 'vitest';

import { extractIconCode, toDailySummary, toHourlyEntries } from './mapper.js';
import { isInsideNyc } from './nyc.js';
import type { UpstreamPeriod } from './types.js';

const period = (overrides: Partial<UpstreamPeriod>): UpstreamPeriod => ({
  startTime: '2026-08-16T19:00:00-04:00',
  isDaytime: true,
  temperature: 84,
  name: 'Monday',
  shortForecast: 'Sunny',
  icon: 'https://api.weather.gov/icons/land/day/skc?size=small',
  ...overrides,
});

describe('extractIconCode', () => {
  it('extracts the condition slug and drops the pop suffix', () => {
    expect(
      extractIconCode(
        'https://api.weather.gov/icons/land/night/rain_showers,50?size=small',
      ),
    ).toBe('rain_showers');
  });

  it('falls back to "unknown" for unrecognized URLs', () => {
    expect(extractIconCode('https://example.com/whatever.png')).toBe('unknown');
  });
});

describe('toHourlyEntries', () => {
  it('coerces null precipitation chance to 0 and caps at 24 entries', () => {
    const periods = Array.from({ length: 30 }, () =>
      period({
        probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: null },
      }),
    );
    const entries = toHourlyEntries(periods);
    expect(entries).toHaveLength(24);
    expect(entries[0]?.precipChance).toBe(0);
  });
});

describe('toDailySummary', () => {
  it('uses the daytime period as high and the night period as low', () => {
    const summary = toDailySummary([
      period({ isDaytime: true, temperature: 84, name: 'Monday' }),
      period({ isDaytime: false, temperature: 71, name: 'Monday Night' }),
    ]);
    expect(summary).toMatchObject({ high: 84, low: 71, name: 'Monday' });
  });

  it('has no high when the first period is a night-only partial day', () => {
    const summary = toDailySummary([
      period({ isDaytime: false, temperature: 69, name: 'Tonight' }),
    ]);
    expect(summary).toMatchObject({ high: null, low: 69, name: 'Tonight' });
  });
});

describe('isInsideNyc', () => {
  it('contains Brooklyn Heights (home) and excludes Los Angeles', () => {
    expect(isInsideNyc({ lat: 40.6936, lon: -73.9902 })).toBe(true);
    expect(isInsideNyc({ lat: 34.0549, lon: -118.2426 })).toBe(false);
  });
});
