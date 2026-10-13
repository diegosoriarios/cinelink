import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { mediaKey } from '../game/media';
import type { MediaType, PersonLite } from '../types/game';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
export type ImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';
const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const TMDB_PROXY_URL = process.env.EXPO_PUBLIC_TMDB_PROXY_URL;

const CREDITS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CREDITS_CACHE_PREFIX = 'tmdb:credits:v2:';
const MAX_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 25_000;

const isAbortError = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError';

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type PersonResult = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
};

export type MediaCredit = {
  id: number;
  title: string;
  media_type: MediaType;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
  job?: string;
  department?: string;
};

export type PersonCreditsResponse = {
  id: number;
  cast: MediaCredit[];
  crew: MediaCredit[];
};

export type TitleCredits = {
  mediaType: MediaType;
  creators: PersonLite[];
  cast: PersonLite[];
};

export type MovieCreditsResponse = {
  id: number;
  cast: { id: number; name: string; profile_path: string | null; known_for_department?: string }[];
  crew: {
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
    known_for_department?: string;
  }[];
};

type RawMediaCredit = {
  id?: number;
  title?: string;
  name?: string;
  media_type?: MediaType;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
  job?: string;
  department?: string;
};

type CombinedCreditsResponse = {
  id: number;
  cast?: RawMediaCredit[];
  crew?: RawMediaCredit[];
};

type TvCreditsResponse = {
  id: number;
  cast: { id: number; name: string; profile_path: string | null; known_for_department?: string }[];
  crew: { id: number; name: string; profile_path: string | null; known_for_department?: string }[];
};

type TvDetailsResponse = {
  id: number;
  created_by?: { id: number; name: string; profile_path: string | null }[];
};

type PersonDetailsResponse = {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  known_for_department: string;
  place_of_birth: string | null;
  profile_path: string | null;
  popularity: number;
};

const memoryCache = new Map<string, CachedValue<unknown>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Prefer a direct API key so the app talks to TMDB itself (local dev, native, and
// web). Fall back to an explicit proxy, then the web app's own origin, only when no
// key is configured.
export const resolveProxyBase = (
  proxyUrl: string | undefined,
  apiKey: string | undefined,
  sameOrigin: string | null
): string | null => {
  if (apiKey) {
    return null;
  }
  const explicit = proxyUrl?.replace(/\/$/, '') || null;
  if (explicit) {
    return explicit;
  }
  return sameOrigin;
};

const getSameOriginProxy = (): string | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const origin = window.location?.origin;
  return origin && origin !== 'null' ? origin : null;
};

// Web always has the same-origin proxy available at runtime, so only native needs
// explicit credentials. Treating web as configured also avoids a static-render
// hydration mismatch (there is no `window` during the web export).
export const isTmdbConfigured = (): boolean =>
  Platform.OS === 'web' || Boolean(TMDB_PROXY_URL || API_KEY);

const buildUrl = (path: string, params: Record<string, string | number | undefined> = {}) => {
  const proxyBase = resolveProxyBase(TMDB_PROXY_URL, API_KEY, getSameOriginProxy());
  if (!proxyBase && !API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_TMDB_API_KEY or EXPO_PUBLIC_TMDB_PROXY_URL environment variable');
  }
  const base = proxyBase ? `${proxyBase}/tmdb` : TMDB_BASE_URL;
  const url = new URL(`${base}${path}`);
  if (!proxyBase && API_KEY) {
    url.searchParams.set('api_key', API_KEY);
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const getCacheKey = (type: 'person' | 'movie' | 'tv', id: number) => `${CREDITS_CACHE_PREFIX}${type}:${id}`;

const getCached = async <T>(key: string): Promise<T | null> => {
  const fromMemory = memoryCache.get(key);
  if (fromMemory && fromMemory.expiresAt > Date.now()) {
    return fromMemory.value as T;
  }
  const persisted = await AsyncStorage.getItem(key);
  if (!persisted) {
    return null;
  }
  try {
    const parsed = JSON.parse(persisted) as CachedValue<T>;
    if (parsed.expiresAt > Date.now()) {
      memoryCache.set(key, parsed as CachedValue<unknown>);
      return parsed.value;
    }
  } catch {
    return null;
  }
  await AsyncStorage.removeItem(key);
  return null;
};

const setCached = async <T>(key: string, value: T) => {
  const payload: CachedValue<T> = {
    value,
    expiresAt: Date.now() + CREDITS_CACHE_TTL_MS
  };
  memoryCache.set(key, payload as CachedValue<unknown>);
  await AsyncStorage.setItem(key, JSON.stringify(payload));
};

const request = async <T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> => {
  let delay = 300;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(buildUrl(path, params), { signal: controller.signal });
    } catch (error) {
      if (!isAbortError(error)) {
        throw error;
      }
      if (attempt === MAX_RETRIES) {
        break;
      }
      await sleep(delay);
      delay *= 2;
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) {
      return (await response.json()) as T;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) {
        break;
      }
      const retryAfter = Number(response.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
      await sleep(waitMs);
      delay *= 2;
      continue;
    }
    const body = await response.text();
    throw new Error(`TMDB request failed ${response.status}: ${body}`);
  }
  throw new Error('TMDB request failed after retries');
};

const uniqueById = <T extends { id: number }>(items: T[]) => {
  const map = new Map<number, T>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
};

export const getImageUrl = (path: string | null | undefined, size: ImageSize = 'w185') => {
  if (!path) {
    return null;
  }
  return `${TMDB_IMAGE_BASE}${size}${path}`;
};

export const searchPerson = async (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [] as PersonResult[];
  }
  const data = await request<{ results: PersonResult[] }>('/search/person', { query: trimmed, page: 1, include_adult: 'false' });
  return data.results.filter((person) => !!person.name).slice(0, 12);
};

const normalizeMediaCredit = (raw: RawMediaCredit): MediaCredit | null => {
  if (typeof raw?.id !== 'number' || !raw.id) {
    return null;
  }
  const title = raw.title ?? raw.name;
  if (!title) {
    return null;
  }
  return {
    id: raw.id,
    title,
    media_type: raw.media_type ?? 'movie',
    release_date: raw.release_date ?? raw.first_air_date,
    poster_path: raw.poster_path ?? null,
    popularity: raw.popularity,
    job: raw.job,
    department: raw.department
  };
};

const uniqueMediaCredits = (items: RawMediaCredit[]): MediaCredit[] => {
  const seen = new Set<string>();
  const out: MediaCredit[] = [];
  for (const item of items) {
    const normalized = normalizeMediaCredit(item);
    if (!normalized) {
      continue;
    }
    const key = mediaKey(normalized.media_type, normalized.id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out;
};

const toPersonLite = (person: { id: number; name: string; profile_path: string | null }): PersonLite => ({
  id: person.id,
  name: person.name,
  profile_path: person.profile_path
});

export const getPersonCredits = async (personId: number) => {
  const cacheKey = getCacheKey('person', personId);
  const cached = await getCached<PersonCreditsResponse>(cacheKey);
  if (cached) {
    return cached;
  }
  const data = await request<CombinedCreditsResponse>(`/person/${personId}/combined_credits`);
  const normalized: PersonCreditsResponse = {
    id: data.id,
    cast: uniqueMediaCredits(data.cast ?? []),
    crew: uniqueMediaCredits(data.crew ?? [])
  };
  await setCached(cacheKey, normalized);
  return normalized;
};

export const getMovieCredits = async (movieId: number) => {
  const cacheKey = getCacheKey('movie', movieId);
  const cached = await getCached<MovieCreditsResponse>(cacheKey);
  if (cached) {
    return cached;
  }
  const data = await request<MovieCreditsResponse>(`/movie/${movieId}/credits`);
  const normalized: MovieCreditsResponse = {
    ...data,
    cast: uniqueById(data.cast),
    crew: uniqueById(data.crew)
  };
  await setCached(cacheKey, normalized);
  return normalized;
};

const getTvCredits = async (tvId: number): Promise<TitleCredits> => {
  const cacheKey = getCacheKey('tv', tvId);
  const cached = await getCached<TitleCredits>(cacheKey);
  if (cached) {
    return cached;
  }
  const [details, credits] = await Promise.all([
    request<TvDetailsResponse>(`/tv/${tvId}`),
    request<TvCreditsResponse>(`/tv/${tvId}/credits`)
  ]);
  const normalized: TitleCredits = {
    mediaType: 'tv',
    creators: (details.created_by ?? []).map(toPersonLite),
    cast: uniqueById(credits.cast).map(toPersonLite)
  };
  await setCached(cacheKey, normalized);
  return normalized;
};

export const getTitleCredits = async (mediaType: MediaType, id: number): Promise<TitleCredits> => {
  if (mediaType === 'tv') {
    return getTvCredits(id);
  }
  const credits = await getMovieCredits(id);
  return {
    mediaType: 'movie',
    creators: credits.crew
      .filter((member) => member.department === 'Directing' && member.job === 'Director')
      .map(toPersonLite),
    cast: credits.cast.map(toPersonLite)
  };
};

export const getPersonDetails = async (personId: number) => {
  return request<PersonDetailsResponse>(`/person/${personId}`);
};
