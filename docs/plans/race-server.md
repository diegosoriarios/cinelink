# Race Mode — Server Plan

Realtime 1v1 racing for CineLink: two friends get the same start/target person pair and race
to connect them through shared movie credits. First validated connection wins.

## Locked decisions

| Decision | Choice |
|---|---|
| Backend | Own Node.js server (TypeScript, Express + `ws`) in this repo (`server/`) |
| Hosting | Render — free tier now (accepts cold starts), $7/mo always-on later if needed |
| Scope | One server serves both `/tmdb` (proxy, replaces the Cloudflare worker) and `/race` |
| Matchmaking | Friends via 4-char room code (no random-opponent queue) |
| Puzzle | Random distinct pair dealt from `src/data/tmdbPool.json` per round (and rematch) |
| Time limit | 5:00 per race — on timeout, most hops wins, tie = draw |
| Win validation | Server-side: the winner's claimed path is verified hop-by-hop via TMDB `movie_credits` (in-memory cache, 24h TTL) before the win is accepted |
| Results persistence | Deferred — race results live only in the room; Stats tab unchanged (future: D1/DB + leaderboard) |

## Architecture

- `server/index.ts` — Express app: `/healthz`, `/tmdb/*` proxy (path rewrite + `TMDB_API_KEY`
  injected server-side + CORS, parity with the old worker), `/race/*` REST + WebSocket upgrade.
  Binds `0.0.0.0:$PORT`. Dev: `npm run dev:server` (`tsx watch`, :8787). Prod start: `npx tsx server/index.ts`.
- `server/race-room.ts` — room state machine, kept pure/injectable for tests.
- `server/pool.ts` — imports `../src/data/tmdbPool.json` (single source of truth).
- `src/game/chainRules.ts` — dependency-free shared-credit validation logic used by both the
  server and the app (no AsyncStorage/RN imports).
- Hardening (former "Phase 3", folded in): TMDB path allowlist + per-IP rate limit on room creation.

### Room lifecycle

`POST /race/rooms` → `{ code }` · `GET /race/rooms/:code` → lobby peek ·
`GET /race/rooms/:code/ws` → WebSocket.

Phases: `lobby → countdown (3s) → racing (5:00) → finished`.

### WS protocol (JSON)

- Client → server: `join {playerId, nickname}`, `start` (host only), `progress {hops, currentPersonName}`,
  `claim {path}`, `rematch`, `leave`
- Server → client: `roomState` (full sync on join/reconnect), `countdown {endsAt}`,
  `progress`, `finished {winnerId, path, reason}`, `roomClosed {reason}`, `error {code}`

End conditions: first **valid** claim wins (invalid claim rejected, claimant keeps racing);
timeout at 5:00 → most hops wins / draw; rematch re-deals a new pair.

Departures:
- **Host leaves mid-race** (`countdown`/`racing`, explicit or disconnect) → the room closes
  immediately for everyone (`roomClosed {reason: 'host_left'}`), no grace period.
- **Guest leaves/disconnects mid-race** → the race keeps running; after the 30s grace the host
  wins by forfeit, and if the guest reconnects in time the race resumes.
- **Host leaves in the lobby** → the remaining player is promoted to host so the race can start.

### Render free-tier truths

- First request after ~15 min idle takes ~30–60s to wake (fine for friends).
- Deploys drop open connections — client reconnect logic is mandatory anyway.

## Phases

### S1 — Server foundation + TMDB cut-over
Server skeleton (`/healthz`, `/tmdb` proxy, `/race` REST + WS echo, room create/join), hardening,
`vitest` setup (`npm run test:server`, added to CI), deploy to Render, repoint
`EXPO_PUBLIC_TMDB_PROXY_URL`, delete `worker/`.

### S2 — Race logic
Phase machine, puzzle dealing, progress pings, claim validation with cache, timeout/forfeit/draw,
rematch. Tests: valid/invalid claim, double-claim ordering, timeout tiebreak, forfeit, rematch.

### S3 — Client
Extract `CreditsBrowser.tsx` from `GameScreen` (props-driven, zero test changes);
`src/net/identity.ts` (persisted playerId + nickname), `raceClient.ts` (WS + backoff reconnect +
resync), `raceStore.ts` (zustand mirror + reducer tests); `app/game/race.tsx` (lobby → race →
results); Home "Race a friend"; `EXPO_PUBLIC_RACE_URL` env; desktop TopNav/two-column rules apply.

### S4 — Polish
Disconnect banners, join-rejection UX, race share text, reconnect-after-sleep recovery,
full verification gate (`npm test`, `npm run test:server`, lint, typecheck, `export:web`)
+ live two-tab race.

## Status

- [x] S1 — server foundation + TMDB proxy cut-over (REST room create/peek, WS upgrade, `join`,
  host election, max 2 players, tests). Merged in PR #1.
- [x] S2 — race logic (phase machine, puzzle dealing, `start`/`progress`/`claim`/`rematch`, claim
  validation with cache, timeout/forfeit/draw). Implemented in `server/race-rooms.ts`,
  `server/race-validator.ts`, `server/pool.ts` and wired in `server/app.ts`.
- [x] S3 — client (routes, Home button, net layer, store, RaceScreen, CreditsBrowser extraction,
  tests).
- [ ] S4 — polish + full production verification.

## Next up — polish and production verification

1. **Server S2** — ✅ done (`server/race-rooms.ts`, `server/race-validator.ts`, `server/pool.ts`,
   `server/app.ts`). Phase machine, random pair dealing, `start`/`progress`/`claim`/`rematch`/
   `leave`, server-side claim validation with a 24h credits cache, timeout (fewest hops wins,
   tie = draw), 30s disconnect grace → forfeit. Covered by `test:server`.
2. **CORS on `/race/*` (web build)** — ✅ done. CORS is now applied app-wide in `server/app.ts`.
3. **Configure `EXPO_PUBLIC_RACE_URL` in production builds** — `release-apk.yml` now injects it
   (add an Actions repo variable `EXPO_PUBLIC_RACE_URL`). Still set it in the Vercel project env.

4. **Cold-start resilience (optional polish)**
   - Render free tier can take 30-60s to wake. `RaceSocket` reconnects, but the initial
     `createRaceRoom`/`peekRaceRoom` fetches have no retry — add a small retry/backoff so the
     first "Create/Join" after idle doesn't hard-fail.

5. **S4 polish + gate**
   - Disconnect banners, join-rejection UX, race share text, reconnect-after-sleep recovery.
   - Run `npm test`, `npm run test:server`, lint, typecheck, `export:web`, then a live two-tab race.

### Deploy reminders

- `deploy-server.yml` triggers only on `server/**`, `src/data/**`, package files, so S2 changes
  will redeploy the server automatically; the current frontend-only commit will not.
- Render free tier drops connections on deploy — client reconnect (already implemented) is required.

### Frontend contract implemented (for reference when building S2)

Client → server: `join {playerId, nickname}`, `start`, `progress {hops, currentPersonName}`,
`claim {path}`, `rematch`, `leave`.
Server → client: `roomState {state:{code, phase, players, start?, target?}}`,
`countdown {endsAt}`, `progress {playerId, hops, currentPersonName?}`,
`finished {winnerId, reason, path?}`, `error {code}`.
Types live in `src/types/race.ts`.
