import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCreditsCache, validateRaceClaim, type CreditsFetcher } from './race-validator';

const creditsFrom = (map: Record<number, string[]>): CreditsFetcher => async (personId) => new Set(map[personId] ?? []);

const VALID_CREDITS = { 1: ['movie:100'], 2: ['movie:100', 'movie:200'], 9: ['movie:200'] };

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TMDB_API_KEY;
});

describe('validateRaceClaim', () => {
  it('accepts a chain from start to target with a shared credit per hop', async () => {
    const result = await validateRaceClaim({
      path: [1, 2, 9],
      startId: 1,
      targetId: 9,
      getCredits: creditsFrom(VALID_CREDITS)
    });
    expect(result).toEqual({ valid: true, reason: 'claim' });
  });

  it('rejects short, misanchored or broken paths', async () => {
    const getCredits = creditsFrom(VALID_CREDITS);

    await expect(validateRaceClaim({ path: [1], startId: 1, targetId: 9, getCredits })).resolves.toEqual({
      valid: false,
      reason: 'path_too_short'
    });
    await expect(validateRaceClaim({ path: [2, 9], startId: 1, targetId: 9, getCredits })).resolves.toEqual({
      valid: false,
      reason: 'path_must_start_at_start'
    });
    await expect(validateRaceClaim({ path: [1, 2], startId: 1, targetId: 9, getCredits })).resolves.toEqual({
      valid: false,
      reason: 'path_must_end_at_target'
    });
    await expect(validateRaceClaim({ path: [1, 9], startId: 1, targetId: 9, getCredits })).resolves.toEqual({
      valid: false,
      reason: 'invalid_hop'
    });
  });

  it('reports unavailable credits when the fetcher fails', async () => {
    const getCredits: CreditsFetcher = async () => {
      throw new Error('boom');
    };
    await expect(validateRaceClaim({ path: [1, 9], startId: 1, targetId: 9, getCredits })).resolves.toEqual({
      valid: false,
      reason: 'credits_unavailable'
    });
  });
});

describe('createCreditsCache', () => {
  it('fetches once, injects the api key and caches media keys', async () => {
    process.env.TMDB_API_KEY = 'test-key';
    const fetchImpl = vi.fn(
      async (_input: string | URL) =>
        new Response(
          JSON.stringify({ cast: [{ id: 100, media_type: 'movie' }], crew: [{ id: 200, media_type: 'tv' }, { id: 100, media_type: 'movie' }] }),
          { status: 200 }
        )
    );
    const cache = createCreditsCache({ fetchImpl: fetchImpl as unknown as typeof fetch, ttlMs: 10_000 });

    const first = await cache.getCredits(42);
    const second = await cache.getCredits(42);

    expect([...first].sort()).toEqual(['movie:100', 'tv:200']);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/3/person/42/combined_credits');
    expect(url.searchParams.get('api_key')).toBe('test-key');
  });

  it('throws when the api key is missing', async () => {
    const cache = createCreditsCache({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
    await expect(cache.getCredits(1)).rejects.toThrow(/TMDB_API_KEY/);
  });
});
