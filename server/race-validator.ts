import { validateChain, type ChainValidation } from '../src/game/chainRules';
import { mediaKey } from '../src/game/media';
import type { PersonId } from '../src/types/game';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CREDITS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CreditsResponse = {
  cast?: { id?: number; media_type?: 'movie' | 'tv' }[];
  crew?: { id?: number; media_type?: 'movie' | 'tv' }[];
};

export type CreditsFetcher = (personId: PersonId) => Promise<Set<string>>;

type FetchLike = (input: string | URL, init?: { signal?: AbortSignal }) => Promise<Response>;

export const createCreditsCache = ({ ttlMs = CREDITS_CACHE_TTL_MS, fetchImpl = fetch }: { ttlMs?: number; fetchImpl?: FetchLike } = {}) => {
  const cache = new Map<PersonId, { expiresAt: number; media: Set<string> }>();

  const fetchCredits: CreditsFetcher = async (personId) => {
    const cached = cache.get(personId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.media;
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    const url = new URL(`${TMDB_BASE_URL}/person/${personId}/combined_credits`);
    url.searchParams.set('api_key', apiKey);

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`TMDB credits request failed (${response.status})`);
    }

    const data = (await response.json()) as CreditsResponse;
    const media = new Set<string>();
    for (const credit of [...(data.cast ?? []), ...(data.crew ?? [])]) {
      if (typeof credit?.id === 'number') {
        media.add(mediaKey(credit.media_type ?? 'movie', credit.id));
      }
    }

    cache.set(personId, { expiresAt: Date.now() + ttlMs, media });
    return media;
  };

  return { getCredits: fetchCredits, clear: () => cache.clear() };
};

export type ClaimValidationReason =
  | 'claim'
  | 'path_too_short'
  | 'path_must_start_at_start'
  | 'path_must_end_at_target'
  | 'credits_unavailable'
  | 'invalid_hop';

export type RaceClaimValidation = {
  valid: boolean;
  reason: ClaimValidationReason;
};

export const validateRaceClaim = async ({
  path,
  startId,
  targetId,
  getCredits
}: {
  path: PersonId[];
  startId: PersonId;
  targetId: PersonId;
  getCredits: CreditsFetcher;
}): Promise<RaceClaimValidation> => {
  if (!Array.isArray(path) || path.length < 2) {
    return { valid: false, reason: 'path_too_short' };
  }
  if (path[0] !== startId) {
    return { valid: false, reason: 'path_must_start_at_start' };
  }
  if (path[path.length - 1] !== targetId) {
    return { valid: false, reason: 'path_must_end_at_target' };
  }

  const uniquePeople = [...new Set(path)];
  const creditsByPerson = new Map<PersonId, Set<string>>();
  try {
    const credits = await Promise.all(uniquePeople.map((personId) => getCredits(personId)));
    uniquePeople.forEach((personId, index) => creditsByPerson.set(personId, credits[index]));
  } catch {
    return { valid: false, reason: 'credits_unavailable' };
  }

  const chain: ChainValidation = validateChain(creditsByPerson, path);
  return chain.valid ? { valid: true, reason: 'claim' } : { valid: false, reason: 'invalid_hop' };
};
