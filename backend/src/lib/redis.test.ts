import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientMock = {
  isReady: true,
  on: vi.fn().mockReturnThis(),
  connect: vi.fn(),
  get: vi.fn(),
  setEx: vi.fn(),
};

vi.mock('redis', () => ({ createClient: () => clientMock }));

const { getCached } = await import('./redis.js');

describe('getCached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.isReady = true;
  });

  it('returns the cached value without fetching on a hit', async () => {
    clientMock.get.mockResolvedValue('{"cached":true}');
    const fetchFresh = vi.fn();

    await expect(getCached('k', 60, fetchFresh)).resolves.toEqual({
      cached: true,
    });
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it('fetches and writes through on a miss', async () => {
    clientMock.get.mockResolvedValue(null);
    clientMock.setEx.mockResolvedValue('OK');
    const fetchFresh = vi.fn().mockResolvedValue({ fresh: 1 });

    await expect(getCached('k', 60, fetchFresh)).resolves.toEqual({ fresh: 1 });
    expect(clientMock.setEx).toHaveBeenCalledWith('k', 60, '{"fresh":1}');
  });

  it('falls through to fetch on corrupt cached JSON', async () => {
    clientMock.get.mockResolvedValue('not-json');
    const fetchFresh = vi.fn().mockResolvedValue({ fresh: 1 });

    await expect(getCached('k', 60, fetchFresh)).resolves.toEqual({ fresh: 1 });
  });

  it('falls through to fetch when Redis reads/writes throw', async () => {
    clientMock.get.mockRejectedValue(new Error('read down'));
    clientMock.setEx.mockRejectedValue(new Error('write down'));
    const fetchFresh = vi.fn().mockResolvedValue({ fresh: 1 });

    await expect(getCached('k', 60, fetchFresh)).resolves.toEqual({ fresh: 1 });
  });

  it('skips Redis entirely when the client is not ready', async () => {
    clientMock.isReady = false;
    const fetchFresh = vi.fn().mockResolvedValue({ fresh: 1 });

    await expect(getCached('k', 60, fetchFresh)).resolves.toEqual({ fresh: 1 });
    expect(clientMock.get).not.toHaveBeenCalled();
    expect(clientMock.setEx).not.toHaveBeenCalled();
  });
});
