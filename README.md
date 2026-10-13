# CineLink

CineLink is a movie connection game inspired by six-degrees style gameplay.
Players connect a **start** person to a **target** person through shared movie & TV credits (actors, directors, creators)
.

This project is built with **Expo + React Native + Expo Router + Zustand** and supports **iOS, Android, and Web**.

## Features

- Daily puzzle mode (1 puzzle per day for all of 2026)
- Explorer mode (random pair, unlimited hops)
- Speed Run mode (random pair with running timer)
- TMDB integration with retries, cache, and persistence
- Path validation engine using shared movie & TV credits
- Stats and streak tracking persisted in AsyncStorage
- Shareable emoji result strings
- Web export + Vercel deployment config
- Node server (`server/`) for TMDB proxy + realtime race rooms (Render deployment)

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
- `server/` — Node server: TMDB proxy + race rooms (Express + ws)
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

- `EXPO_PUBLIC_TMDB_API_KEY` — direct TMDB API key. When set, requests go straight to
  `https://api.themoviedb.org` with no backend involved. Recommended for local dev,
  native, and web. On web the key is visible in the JS bundle (client-side key).
- `EXPO_PUBLIC_TMDB_PROXY_URL` — optional proxy base URL. Used **only when no key is
  set**, as a fallback that keeps the key server-side (`${EXPO_PUBLIC_TMDB_PROXY_URL}/tmdb/...`).
  On web with no key and no proxy, the app falls back to its own origin (`/tmdb/...`),
  served by the bundled Vercel function.

Resolution order (see `resolveProxyBase` in `src/api/tmdb.ts`):
1. direct `EXPO_PUBLIC_TMDB_API_KEY`
2. explicit `EXPO_PUBLIC_TMDB_PROXY_URL`
3. same-origin proxy on web (`window.location.origin`)

This means **single-player never needs the Render backend**: with a key configured it
talks to TMDB directly on every platform; without a key, web uses the same-origin Vercel
function and native requires the key/proxy. Only multiplayer (`EXPO_PUBLIC_RACE_URL`)
requires the Render server.

For local development, just set `EXPO_PUBLIC_TMDB_API_KEY` in `.env` (copy
`.env.example`). No server or Render needed.

### API functions

- `searchPerson(query)`
- `getPersonCredits(personId)` — combined movie + TV credits (`/person/{id}/combined_credits`)
- `getTitleCredits(mediaType, id)` — cast + creators (TV) / directors (movie)
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
  - true if at least one shared title exists
- `buildPath(hops)`
  - validates full path end-to-end
  - returns validity + per-hop shared titles

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
- Valid-hop confirmation message with the shared title
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

### Android APK releases

`.github/workflows/release-apk.yml` builds a release APK with `expo prebuild` +
Gradle and attaches it to a GitHub Release.

Triggers:

- pushing a tag matching `v*` (e.g. `v1.0.0`)
- manual `workflow_dispatch` (optional `tag` input; defaults to `v<version>-rc.<run>`)

The workflow overrides `expo.version` / `android.versionCode` from the tag and run
number, builds `assembleRelease`, and uploads `cinelink-<tag>.apk`.

SDK setup uses `android-actions/setup-android@v4.0.4`. Do not downgrade to `@v3`
(≤ v3.2.2): it tries to install the deprecated `tools` package, which Google
removed, so the step fails with `Failed to find package 'tools'`.

Required repository variables/secrets (Settings → Secrets and variables → Actions):

- `EXPO_PUBLIC_TMDB_API_KEY` (secret) — direct TMDB key baked into the app so native
  single-player calls TMDB without the backend. **Required**: the release workflow fails
  fast if it is missing, since an APK without it cannot load any game mode.
- `EXPO_PUBLIC_RACE_URL` (variable) — deployed server URL for the realtime race API
  (e.g. `https://cinelink-server-10b9.onrender.com`); multiplayer only

Optional repository variable:

- `EXPO_PUBLIC_APP_URL`

Optional repository secrets for release signing. If unset, the APK is signed with
Expo's default debug keystore (installable, but not Play Store-ready):

- `ANDROID_KEYSTORE_BASE64` — base64 of your release `.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Generate a keystore and encode it:

```bash
keytool -genkeypair -v -keystore release.keystore -alias cinelink \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # paste into ANDROID_KEYSTORE_BASE64
```

Cut a release:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

### EAS builds

- `eas.json`
  - `development`
  - `preview`
  - `production`

### Vercel static deployment

- `vercel.json`
  - build command: `npm run export:web`
  - output directory: `dist`
  - `/tmdb/:path*` rewrite to the bundled `api/tmdb/[...path].ts` function (key stays server-side)
  - SPA rewrite so expo-router handles dynamic routes client-side

Vercel's Git integration deploys on push (no CI token required). Configure these
environment variables in the Vercel project:

- `EXPO_PUBLIC_TMDB_API_KEY` — direct TMDB key so web calls TMDB itself (no Render, no
  proxy). The key is public in the web bundle; this is the intended setup for CineLink.
- `EXPO_PUBLIC_RACE_URL` — deployed server URL for the realtime race API (multiplayer)
- `EXPO_PUBLIC_APP_URL` — public site URL (used for OG metadata)

Optional: if you ever prefer to keep the key server-side, unset `EXPO_PUBLIC_TMDB_API_KEY`
instead. Web then calls its own origin (`/tmdb/*`), served by the bundled
`api/tmdb/[...path].ts` function (`TMDB_API_KEY`). Setting `EXPO_PUBLIC_TMDB_PROXY_URL`
routes web through that proxy (e.g. the Render server) instead.

### Open Graph metadata

- `app/+html.tsx`
  - `og:title`, `og:description`, `og:image`, `og:url`
  - Twitter card tags
  - `og:url` uses `EXPO_PUBLIC_APP_URL` when set at build time (falls back to a placeholder)

Note: do not create `public/index.html` — the dev server serves it verbatim at `/`,
which shadows the app and results in a blank page.

### Web export

```bash
npm run export:web
```

Output goes to:

- `dist/`

## CineLink Server (TMDB proxy + races)

Directory:

- `server/` — Express + `ws` (TypeScript, run with tsx)

Behavior:

- `GET /healthz` — health check (used by Render)
- `GET /tmdb/*` — proxies to `https://api.themoviedb.org/3/*`
- Injects `TMDB_API_KEY` from env
- Path allowlist (`/person/:id`, `/person/:id/combined_credits`, `/person/:id/movie_credits`,
  `/movie/:id/credits`, `/tv/:id`, `/tv/:id/credits`, `/search/person`) + per-IP
  room-creation rate limit
- `/race/*` — room REST + WebSocket (see `docs/plans/race-server.md`)

The `/tmdb/*` proxy logic lives in `server/tmdb-core.ts` (dependency-free) and is shared
with the web deployment's Vercel Function at `api/tmdb/[...path].ts`, which is wired up by
a `vercel.json` rewrite (`/tmdb/:path*` → `/api/tmdb/:path*`). On Vercel, set the
`TMDB_API_KEY` env var on the project (server-side) so the browser never receives it.

### Single-player without the backend

Daily / explorer / speedrun are fully client-side (bundled data + AsyncStorage). Their
only network need is TMDB data, which comes straight from TMDB when
`EXPO_PUBLIC_TMDB_API_KEY` is configured:

- **Local dev** — set the key in `.env` and play; no server or Render required.
- **Native** — calls TMDB directly with `EXPO_PUBLIC_TMDB_API_KEY`; the Render server is
  not involved.
- **Web** — calls TMDB directly with `EXPO_PUBLIC_TMDB_API_KEY` (the key is visible in the
  bundle), so a Render outage does not affect single-player. If you'd rather hide the
  key, leave it unset and web will use the same-origin Vercel Function (`/tmdb/*`).

Only `EXPO_PUBLIC_RACE_URL` (multiplayer) depends on the Render server.

Race rooms (`/race/*`):

- `POST /race/rooms` → `{ code }`, `GET /race/rooms/:code` → lobby peek
- WebSocket `GET /race/rooms/:code/ws`: `lobby → countdown (3s) → racing (5:00) → finished`
- Client → server: `join`, `start` (host only), `progress`, `claim`, `rematch`, `leave`
- Server → client: `roomState` (full sync incl. `start`/`target`), `countdown`, `progress`,
  `finished`, `error`
- Pairs are dealt at random from `src/data/tmdbPool.json` at each `start`/rematch
- Claims are validated server-side hop-by-hop against TMDB `combined_credits` (24h cache);
  the first valid claim wins, timeout awards the fewest hops (tie = draw),
  disconnect forfeits after a 30s grace window
- CORS is applied app-wide so the web build can reach `/race/*`

Expected server secret:

- `TMDB_API_KEY`

Local development:

```
npm run dev:server   # http://localhost:8787
npm run test:server  # vitest suite
```

Production (Render):

- The repo includes a `render.yaml` blueprint — create a Blueprint instance in the
  Render dashboard and set `TMDB_API_KEY` when prompted (runs on Node 20, health
  check `/healthz`).
- `autoDeploy: false` is set, so deploys are triggered by
  `.github/workflows/deploy-server.yml` instead of Render's Git integration. Add the
  Render Deploy Hook (service → Settings → Deploy Hook) as the
  `RENDER_DEPLOY_HOOK_URL` GitHub Actions secret.

Then configure the multiplayer client env:

- `EXPO_PUBLIC_RACE_URL=https://<your-server-domain>`

Single-player does not need this. On native, set `EXPO_PUBLIC_TMDB_API_KEY`; on web,
single-player uses the bundled Vercel function at the app's own origin by default. Set
`EXPO_PUBLIC_TMDB_PROXY_URL=https://<your-server-domain>` only if you want web to route
through this Render server instead of the Vercel function.

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

Run tests (Jest + jest-expo):

```bash
npm test
```

Verify puzzle data:

```bash
npm run verify:data
```

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

1. `npm run lint -- --max-warnings=0`
2. `npm run typecheck`
3. `npm run verify:data`
4. `npm test -- --ci`
5. `npm run test:server`

## Notes

- Current image assets in `public/assets` are placeholders and should be replaced with production-ready art.
- Daily lose state supports `shortestPath` if present in puzzle entries.
- `puzzles.json` is also duplicated at repo root for convenience.
