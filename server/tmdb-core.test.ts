import { describe, expect, it, vi } from 'vitest';
import { handleTmdbRequest, isAllowedTmdbPath, proxyTmdb, resolveTmdbPath } from './tmdb-core';

const jsonFetch = (body = '{"id":123}', status = 200) =>
  vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  );

describe('isAllowedTmdbPath', () => {
  it('accepts the allowlisted endpoints', () => {
    expect(isAllowedTmdbPath('/person/123')).toBe(true);
    expect(isAllowedTmdbPath('/person/123/movie_credits')).toBe(true);
    expect(isAllowedTmdbPath('/movie/456/credits')).toBe(true);
    expect(isAllowedTmdbPath('/search/person')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAllowedTmdbPath('/configuration')).toBe(false);
    expect(isAllowedTmdbPath('/person/abc')).toBe(false);
    expect(isAllowedTmdbPath('/movie/456')).toBe(false);
  });
});

describe('resolveTmdbPath', () => {
  it('reads the path from the proxy query key', () => {
    const params = new URLSearchParams({ tmdb_path: 'person/123/movie_credits' });
    expect(resolveTmdbPath('/api/tmdb', params)).toBe('/person/123/movie_credits');
  });

  it('strips the /api/tmdb prefix from the pathname', () => {
    expect(resolveTmdbPath('/api/tmdb/person/123')).toBe('/person/123');
  });

  it('strips the /tmdb prefix from the pathname', () => {
    expect(resolveTmdbPath('/tmdb/search/person')).toBe('/search/person');
  });

  it('passes through unknown pathnames', () => {
    expect(resolveTmdbPath('/person/123')).toBe('/person/123');
  });
});

describe('proxyTmdb', () => {
  it('forwards allowed paths, injects the key, and strips proxy params', async () => {
    const fetchImpl = jsonFetch();
    const result = await proxyTmdb({
      path: '/person/123/movie_credits',
      searchParams: new URLSearchParams({ query: 'tom', api_key: 'sneaky', tmdb_path: 'person/123/movie_credits' }),
      apiKey: 'test-key',
      fetchImpl
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('application/json');
    expect(result.body).toBe('{"id":123}');

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/3/person/123/movie_credits');
    expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
    expect(calledUrl.searchParams.get('query')).toBe('tom');
    expect(calledUrl.searchParams.has('tmdb_path')).toBe(false);
  });

  it('rejects paths outside the allowlist without calling upstream', async () => {
    const fetchImpl = jsonFetch();
    const result = await proxyTmdb({ path: '/configuration', apiKey: 'test-key', fetchImpl });

    expect(result.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 500 when the api key is missing', async () => {
    const fetchImpl = jsonFetch();
    const result = await proxyTmdb({ path: '/person/123', fetchImpl });

    expect(result.status).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 502 when the upstream request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await proxyTmdb({ path: '/person/123', apiKey: 'test-key', fetchImpl });

    expect(result.status).toBe(502);
  });
});

describe('handleTmdbRequest', () => {
  it('answers preflight requests with CORS headers', async () => {
    const response = await handleTmdbRequest(new Request('https://example.com/api/tmdb/person/123', { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects non-GET methods', async () => {
    const response = await handleTmdbRequest(new Request('https://example.com/api/tmdb/person/123', { method: 'POST', body: '{}' }));

    expect(response.status).toBe(405);
  });

  it('proxies a GET request, preserving the query string', async () => {
    const fetchImpl = jsonFetch('{"results":[]}');
    const response = await handleTmdbRequest(
      new Request('https://example.com/api/tmdb/search/person?query=tom&page=1'),
      { apiKey: 'test-key', fetchImpl }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({ results: [] });

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/3/search/person');
    expect(calledUrl.searchParams.get('query')).toBe('tom');
    expect(calledUrl.searchParams.get('page')).toBe('1');
    expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
  });
});
