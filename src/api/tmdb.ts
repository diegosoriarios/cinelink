import AsyncStorage from '@react-native-async-storage/async-storage';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';
const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const TMDB_PROXY_URL = process.env.EXPO_PUBLIC_TMDB_PROXY_URL;

const CREDITS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CREDITS_CACHE_PREFIX = 'tmdb:credits:';
const MAX_RETRIES = 4;

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

export type PersonCreditsResponse = {
  id: number;
  cast: { id: number; title: string; release_date?: string; poster_path?: string | null; popularity?: number }[];
  crew: {
    id: number;
    title: string;
    job: string;
    department: string;
    release_date?: string;
    poster_path?: string | null;
    popularity?: number;
  }[];
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

const buildUrl = (path: string, params: Record<string, string | number | undefined> = {}) => {
  const proxyBase = TMDB_PROXY_URL?.replace(/\/$/, '');
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

const getCacheKey = (type: 'person' | 'movie', id: number) => `${CREDITS_CACHE_PREFIX}${type}:${id}`;

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
    const response = await fetch(buildUrl(path, params));
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

export const getImageUrl = (path: string | null | undefined) => {
  if (!path) {
    return null;
  }
  return `${TMDB_IMAGE_BASE}${path}`;
};

export const searchPerson = async (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [] as PersonResult[];
  }
  const data = await request<{ results: PersonResult[] }>('/search/person', { query: trimmed, page: 1, include_adult: 'false' });
  return data.results.filter((person) => !!person.name).slice(0, 12);
};

export const getPersonCredits = async (personId: number) => {
  const cacheKey = getCacheKey('person', personId);
  const cached = await getCached<PersonCreditsResponse>(cacheKey);
  if (cached) {
    return cached;
  }
  const data = await request<PersonCreditsResponse>(`/person/${personId}/movie_credits`);
  const normalized: PersonCreditsResponse = {
    ...data,
    cast: uniqueById(data.cast),
    crew: uniqueById(data.crew)
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

export const getPersonDetails = async (personId: number) => {
  return request<PersonDetailsResponse>(`/person/${personId}`);
};
