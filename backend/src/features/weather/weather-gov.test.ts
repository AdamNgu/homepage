import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpstreamError, getPoints, truncateCoord } from './weather-gov.js';

describe('truncateCoord', () => {
  it('caps precision at 4 decimals (weather.gov 301s on more)', () => {
    expect(truncateCoord(40.69361111)).toBe('40.6936');
    expect(truncateCoord(-73.99025555)).toBe('-73.9903');
  });

  it('keeps short values intact and normalizes negative zero', () => {
    expect(truncateCoord(40.5)).toBe('40.5');
    expect(truncateCoord(-0.00001)).toBe('0');
  });
});

describe('getPoints error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not retry 4xx responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPoints('40.0', '-73.0')).rejects.toMatchObject({
      name: 'UpstreamError',
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps repeated network failures as a 502 UpstreamError', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = getPoints('40.0', '-73.0');
    await expect(result).rejects.toBeInstanceOf(UpstreamError);
    await expect(result).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
