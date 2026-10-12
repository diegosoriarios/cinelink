import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const PAGES = [1, 2, 3];
const MAX_POSTERS = 60;

const loadEnv = () => {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadEnv();

const apiKey = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY;
if (!apiKey) {
  console.error('Missing TMDB key. Set TMDB_API_KEY or EXPO_PUBLIC_TMDB_API_KEY (or add it to .env).');
  process.exit(1);
}

const posters = new Map();

for (const page of PAGES) {
  const url = new URL(`${TMDB_BASE_URL}/trending/movie/day`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('page', String(page));

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`TMDB request failed (${response.status}) for page ${page}`);
    process.exit(1);
  }
  const data = await response.json();
  for (const movie of data.results ?? []) {
    if (!movie?.id || !movie?.poster_path || posters.has(movie.id)) {
      continue;
    }
    posters.set(movie.id, {
      id: movie.id,
      title: movie.title ?? movie.name ?? '',
      poster_path: movie.poster_path
    });
  }
}

const result = [...posters.values()].slice(0, MAX_POSTERS);
const outPath = join(process.cwd(), 'src/data/posters.json');
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${result.length} posters to src/data/posters.json`);
