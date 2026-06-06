# CineLink

CineLink is a movie connection game inspired by six-degrees style gameplay.
Players connect a **start** person to a **target** person through shared movie credits (actors/directors).

This project is built with **Expo + React Native + Expo Router + Zustand** and supports **iOS, Android, and Web**.

## Features

- Daily puzzle mode (1 puzzle per day for all of 2026)
- Explorer mode (random pair, unlimited hops)
- Speed Run mode (random pair with running timer)
- TMDB integration with retries, cache, and persistence
- Path validation engine using shared movie credits
- Stats and streak tracking persisted in AsyncStorage
- Shareable emoji result strings
- Web export + Vercel deployment config
- Cloudflare Worker proxy option for API key protection

## Project Structure

- `app/_layout.tsx` — root stack layout
- `app/(tabs)/_layout.tsx` — tab layout (Home, Stats)
- `app/(tabs)/index.tsx` — Home screen
- `app/(tabs)/stats.tsx` — Stats screen
- `app/game/[mode].tsx` — mode-based game route (`daily | explorer | speedrun`)
- `src/screens/GameScreen.tsx` — core game UI and hop flow
- `src/game/gameState.ts` — Zustand state management
- `src/game/validator.ts` — shared-movie and path validation
- `src/api/tmdb.ts` — TMDB client (retry + cache + persistence)
- `src/data/puzzles.json` — 365 daily puzzles for 2026
- `src/data/tmdbPool.json` — curated person pool (actors/directors)
- `src/data/tmdbPoolIds.json` — ID-only pool list
- `worker/tmdb-proxy.js` — Cloudflare Worker proxy
- `scripts/verify-data.mjs` — puzzle + pool integrity checks

## Gameplay Modes

### Daily

- Loads today’s puzzle by matching date (YYYY-MM-DD)
- Max hops: **6**
- Tracks win/loss and streak
- Stores daily history in AsyncStorage

### Explorer

- Random start/target from curated pool
- Unlimited hops
- Hop count tracked for stats-style display

### Speed Run

- Explorer-like random pair
- Running timer while game is active

## Data Files

### `puzzles.json`

Contains 365 entries (Jan 1 → Dec 31, 2026), each like:

```json
{
  "date": "2026-01-01",
  "startId": 1813,
  "startName": "Anne Hathaway",
  "endId": 56734,
  "endName": "Margot Robbie"
}
```

Rules enforced in generation/verification:

- Full year coverage (2026-01-01 → 2026-12-31)
- Unique pairs
- `startId !== endId`
- IDs exist in curated pool

### `tmdbPool.json`

Curated list of popular actors/directors used as pair pool.

- Includes both actors and directors
- Includes id, name, and kind
- Current pool size: **119**

### Verification

Run:

```bash
npm run verify:data
```

This validates:

- puzzle count is 365
- dates are contiguous through 2026
- no duplicate pairs
- no invalid IDs

## TMDB Client (`src/api/tmdb.ts`)

### Environment variables

- `EXPO_PUBLIC_TMDB_API_KEY` — direct TMDB API key
- `EXPO_PUBLIC_TMDB_PROXY_URL` — optional proxy base URL (recommended for production)

If `EXPO_PUBLIC_TMDB_PROXY_URL` is set, requests go to:

- `${EXPO_PUBLIC_TMDB_PROXY_URL}/tmdb/...`

Otherwise requests go directly to TMDB.

### API functions

- `searchPerson(query)`
- `getPersonCredits(personId)`
- `getMovieCredits(movieId)`
- `getPersonDetails(personId)`
- `getImageUrl(path)`

### Caching

- In-memory cache (`Map`)
- AsyncStorage persistence for credits
- TTL: **24h**

### Retry behavior

- Retries on `429` and `5xx`
- Exponential backoff
- `Retry-After` header respected when present

## Path Validator (`src/game/validator.ts`)

- `getSharedMovies(personIdA, personIdB)`
  - intersection of movie IDs in both people’s credits
- `isValidHop(personIdA, personIdB)`
  - true if at least one shared movie exists
- `buildPath(hops)`
  - validates full path end-to-end
  - returns validity + per-hop shared movies

## Game State (`src/game/gameState.ts`)

State includes:

- mode
- start/target person
- current path
- hops metadata
- win/loss flags
- max hops (daily = 6)
- timer (speedrun)
- streak, best streak, history

Persistence keys:

- `cinelink:history`
- `cinelink:streak`
- `cinelink:best_streak`

`shareResult()` outputs Wordle-style strings, e.g.:

- `🎬→🎬→✅`

## Core UI (`src/screens/GameScreen.tsx`)

- Start/target cards with profile images
- Horizontal path timeline (person → movie → person)
- Search input with TMDB dropdown + photos
- Hop validation on person selection
- Valid-hop confirmation message with shared movie title
- Invalid-hop error message
- Win panel with confetti and share
- Daily lose panel with shortest-path placeholder display
- HUD with hop counter (daily) and timer (speedrun)

## Navigation

Expo Router file-based routing:

- Home: `app/(tabs)/index.tsx`
- Stats: `app/(tabs)/stats.tsx`
- Game route by mode: `app/game/[mode].tsx`

Tabs are configured in:

- `app/(tabs)/_layout.tsx`

Root stack in:

- `app/_layout.tsx`

## Release and Deployment

### App config

- `app.json`
  - icon/splash/adaptive icon
  - dark mode
  - web static output

### Metro config

- `metro.config.js`

### EAS builds

- `eas.json`
  - `development`
  - `preview`
  - `production`

### Vercel static deployment

- `vercel.json`
  - build command: `npm run export:web`
  - output directory: `dist`

### Open Graph metadata

- `public/index.html`
  - `og:title`, `og:description`, `og:image`, `og:url`
  - Twitter card tags

### Web export

```bash
npm run export:web
```

Output goes to:

- `dist/`

## Cloudflare Worker Proxy

File:

- `worker/tmdb-proxy.js`

Behavior:

- Proxies `/tmdb/*` to `https://api.themoviedb.org/3/*`
- Injects `TMDB_API_KEY` from Worker secret
- Adds permissive CORS headers

Expected Worker secret:

- `TMDB_API_KEY`

Then configure client app env:

- `EXPO_PUBLIC_TMDB_PROXY_URL=https://<your-worker-domain>`

## Development

Install dependencies:

```bash
npm install
```

Run app:

```bash
npm run start
```

Web dev:

```bash
npm run web
```

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Verify puzzle data:

```bash
npm run verify:data
```

## Notes

- Current image assets in `public/assets` are placeholders and should be replaced with production-ready art.
- Daily lose state supports `shortestPath` if present in puzzle entries.
- `puzzles.json` is also duplicated at repo root for convenience.
