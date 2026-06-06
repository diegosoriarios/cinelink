export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/tmdb/')) {
      return new Response('Not found', { status: 404 });
    }

    const tmdbPath = url.pathname.replace('/tmdb', '');
    const target = new URL(`https://api.themoviedb.org/3${tmdbPath}`);

    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'api_key') {
        target.searchParams.set(key, value);
      }
    }

    target.searchParams.set('api_key', env.TMDB_API_KEY);

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: {
        Accept: 'application/json'
      }
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  }
};
