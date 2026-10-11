import { Router } from 'express';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const ALLOWED_PATHS = [/^\/person\/\d+$/, /^\/person\/\d+\/movie_credits$/, /^\/movie\/\d+\/credits$/, /^\/search\/person$/];

export const isAllowedTmdbPath = (path: string) => ALLOWED_PATHS.some((pattern) => pattern.test(path));

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const createTmdbRouter = () => {
  const router = Router();

  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  router.get('/*', async (req, res) => {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'TMDB_API_KEY is not configured' });
      return;
    }

    if (!isAllowedTmdbPath(req.path)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const target = new URL(`${TMDB_BASE_URL}${req.path}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'api_key' && typeof value === 'string') {
        target.searchParams.set(key, value);
      }
    }
    target.searchParams.set('api_key', apiKey);

    try {
      const upstream = await fetch(target, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
      res.send(body);
    } catch {
      res.status(502).json({ error: 'TMDB request failed' });
    }
  });

  return router;
};
