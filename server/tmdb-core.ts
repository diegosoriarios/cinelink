export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const ALLOWED_PATHS = [/^\/person\/\d+$/, /^\/person\/\d+\/movie_credits$/, /^\/movie\/\d+\/credits$/, /^\/search\/person$/];

export const isAllowedTmdbPath = (path: string) => ALLOWED_PATHS.some((pattern) => pattern.test(path));

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const TMDB_PROXY_QUERY_KEY = 'tmdb_path';

const PROXY_PREFIXES = ['/api/tmdb', '/tmdb'];

export const resolveTmdbPath = (pathname: string, searchParams?: URLSearchParams): string => {
  const fromQuery = searchParams?.get(TMDB_PROXY_QUERY_KEY);
  if (fromQuery && fromQuery.trim().length > 0) {
    return fromQuery.startsWith('/') ? fromQuery : `/${fromQuery}`;
  }
  for (const prefix of PROXY_PREFIXES) {
    if (pathname === prefix) {
      return '/';
    }
    if (pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length);
    }
  }
  return pathname;
};

export type TmdbProxyResult = {
  status: number;
  body: string;
  contentType: string;
};

export type TmdbProxyParams = {
  path: string;
  searchParams?: URLSearchParams;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const jsonResult = (status: number, payload: unknown): TmdbProxyResult => ({
  status,
  body: JSON.stringify(payload),
  contentType: 'application/json'
});

export const proxyTmdb = async ({
  path,
  searchParams,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 10_000
}: TmdbProxyParams): Promise<TmdbProxyResult> => {
  if (!apiKey) {
    return jsonResult(500, { error: 'TMDB_API_KEY is not configured' });
  }

  if (!isAllowedTmdbPath(path)) {
    return jsonResult(404, { error: 'Not found' });
  }

  const target = new URL(`${TMDB_BASE_URL}${path}`);
  searchParams?.forEach((value, key) => {
    if (key !== 'api_key' && key !== TMDB_PROXY_QUERY_KEY) {
      target.searchParams.set(key, value);
    }
  });
  target.searchParams.set('api_key', apiKey);

  try {
    const upstream = await fetchImpl(target, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await upstream.text();
    return {
      status: upstream.status,
      body,
      contentType: upstream.headers.get('content-type') ?? 'application/json'
    };
  } catch {
    return jsonResult(502, { error: 'TMDB request failed' });
  }
};

export type TmdbRequestHandlerOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const handleTmdbRequest = async (
  request: Request,
  { apiKey = process.env.TMDB_API_KEY, fetchImpl, timeoutMs }: TmdbRequestHandlerOptions = {}
): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const result = await proxyTmdb({
    path: resolveTmdbPath(url.pathname, url.searchParams),
    searchParams: url.searchParams,
    apiKey,
    fetchImpl,
    timeoutMs
  });

  return new Response(result.body, {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': result.contentType }
  });
};
