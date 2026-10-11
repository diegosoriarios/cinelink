type TmdbModule = typeof import('../api/tmdb');

type TmdbTestContext = {
  tmdb: TmdbModule;
  fetchMock: jest.Mock;
};

const store = () => (globalThis as unknown as { __mockAsyncStorageStore: Map<string, string> }).__mockAsyncStorageStore;

const makeResponse = (options: { body?: unknown; status?: number; headers?: Record<string, string> }) => {
  const { body = {}, status = 200, headers = {} } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
};

const importTmdb = (): TmdbTestContext => {
  const fetchMock = jest.fn();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  jest.resetModules();
  // A fresh synchronous require is required to re-evaluate the module with new env vars after resetModules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return { tmdb: require('../api/tmdb') as TmdbModule, fetchMock };
};

beforeEach(() => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  delete process.env.EXPO_PUBLIC_TMDB_PROXY_URL;
});

afterEach(() => {
  (globalThis as unknown as { __resetMockAsyncStorage: () => void }).__resetMockAsyncStorage();
  delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  delete process.env.EXPO_PUBLIC_TMDB_PROXY_URL;
});

describe('searchPerson', () => {
  it('builds a direct TMDB URL with api key and query params', async () => {
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValueOnce(makeResponse({ body: { results: [{ id: 1, name: 'Anne Hathaway', profile_path: null }] } }));

    await tmdb.searchPerson('anne');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('https://api.themoviedb.org/3/search/person');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('query')).toBe('anne');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('include_adult')).toBe('false');
  });

  it('routes through the proxy without leaking the api key', async () => {
    process.env.EXPO_PUBLIC_TMDB_PROXY_URL = 'https://proxy.example.com/';
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValueOnce(makeResponse({ body: { results: [] } }));

    await tmdb.searchPerson('anne');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('https://proxy.example.com/tmdb/search/person');
    expect(url.searchParams.get('api_key')).toBeNull();
    expect(url.searchParams.get('query')).toBe('anne');
  });

  it('throws when neither api key nor proxy is configured', async () => {
    delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    const { tmdb, fetchMock } = importTmdb();

    await expect(tmdb.searchPerson('anne')).rejects.toThrow('EXPO_PUBLIC_TMDB_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty list for blank queries without hitting the network', async () => {
    const { tmdb, fetchMock } = importTmdb();
    await expect(tmdb.searchPerson('   ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters unnamed people and limits results to 12', async () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, profile_path: null }));
    results[5] = { id: 99, name: '', profile_path: null };
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValueOnce(makeResponse({ body: { results } }));

    const people = await tmdb.searchPerson('x');

    expect(people).toHaveLength(12);
    expect(people.some((p) => !p.name)).toBe(false);
  });
});

describe('request retry behavior', () => {
  it('retries once on 429 honoring Retry-After then succeeds', async () => {
    const { tmdb, fetchMock } = importTmdb();
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 429, headers: { 'Retry-After': '0.001' } }))
      .mockResolvedValueOnce(makeResponse({ body: { results: [] } }));

    await expect(tmdb.searchPerson('anne')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 404', async () => {
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 404, body: { status_message: 'Not found' } }));

    await expect(tmdb.searchPerson('anne')).rejects.toThrow('TMDB request failed 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_RETRIES attempts on persistent 429', async () => {
    const { tmdb, fetchMock } = importTmdb();
    for (let i = 0; i <= 4; i += 1) {
      fetchMock.mockResolvedValueOnce(makeResponse({ status: 429, headers: { 'Retry-After': '0.001' } }));
    }

    await expect(tmdb.searchPerson('anne')).rejects.toThrow('after retries');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('credits cache', () => {
  const creditsBody = {
    id: 42,
    cast: [
      { id: 101, title: 'Movie A', release_date: '2020-01-01' },
      { id: 101, title: 'Movie A', release_date: '2020-01-01' },
      { id: 102, title: 'Movie B' }
    ],
    crew: [{ id: 102, title: 'Movie B', job: 'Director', department: 'Directing' }]
  };

  it('persists credits to AsyncStorage and dedupes movie ids', async () => {
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValueOnce(makeResponse({ body: creditsBody }));
    await tmdb.getPersonCredits(42);

    const cachedRaw = store().get('tmdb:credits:person:42');
    expect(cachedRaw).toBeDefined();
    const cached = JSON.parse(cachedRaw!) as { value: { cast: unknown[]; crew: unknown[] }; expiresAt: number };
    expect(cached.value.cast).toHaveLength(2);
    expect(cached.value.crew).toHaveLength(1);
    expect(cached.expiresAt).toBeGreaterThan(Date.now());
  });

  it('serves the second call from memory cache without refetching', async () => {
    const { tmdb, fetchMock } = importTmdb();
    fetchMock.mockResolvedValue(makeResponse({ body: creditsBody }));
    await tmdb.getPersonCredits(42);
    await tmdb.getPersonCredits(42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh module instance from persisted cache', async () => {
    const first = importTmdb();
    first.fetchMock.mockResolvedValueOnce(makeResponse({ body: creditsBody }));
    await first.tmdb.getPersonCredits(42);
    expect(first.fetchMock).toHaveBeenCalledTimes(1);

    const second = importTmdb();
    await second.tmdb.getPersonCredits(42);
    expect(second.fetchMock).not.toHaveBeenCalled();
  });

  it('refetches when the persisted entry has expired', async () => {
    const first = importTmdb();
    first.fetchMock.mockResolvedValue(makeResponse({ body: creditsBody }));
    await first.tmdb.getPersonCredits(42);

    const cachedRaw = store().get('tmdb:credits:person:42')!;
    const cached = JSON.parse(cachedRaw) as { expiresAt: number };
    cached.expiresAt = Date.now() - 1000;
    store().set('tmdb:credits:person:42', JSON.stringify(cached));

    const second = importTmdb();
    second.fetchMock.mockResolvedValue(makeResponse({ body: creditsBody }));
    await second.tmdb.getPersonCredits(42);

    expect(first.fetchMock).toHaveBeenCalledTimes(1);
    expect(second.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getImageUrl', () => {
  it('returns null for missing paths and builds w185 URLs otherwise', async () => {
    const { tmdb } = importTmdb();
    expect(tmdb.getImageUrl(null)).toBeNull();
    expect(tmdb.getImageUrl(undefined)).toBeNull();
    expect(tmdb.getImageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
  });
});
