import { Router } from 'express';
import { corsHeaders, proxyTmdb } from './tmdb-core';

export { isAllowedTmdbPath, corsHeaders } from './tmdb-core';

const toSearchParams = (query: Record<string, unknown>): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  return params;
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
    const result = await proxyTmdb({
      path: req.path,
      searchParams: toSearchParams(req.query as Record<string, unknown>),
      apiKey: process.env.TMDB_API_KEY
    });

    res.status(result.status);
    res.setHeader('Content-Type', result.contentType);
    res.send(result.body);
  });

  return router;
};
