import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createApp, type CreateAppOptions } from './app';
import type {
  CountdownMessage,
  ErrorMessage,
  FinishedMessage,
  ProgressMessage,
  RoomClosedMessage,
  RoomStateMessage,
  RoomStore,
  ServerMessage
} from './race-rooms';

const startServer = async (options?: CreateAppOptions) => {
  const { server, roomStore } = createApp(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, port, roomStore };
};

const openSockets: WebSocket[] = [];

const connectRoom = (port: number, code: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/race/rooms/${code}/ws`);
    ws.on('open', () => {
      openSockets.push(ws);
      resolve(ws);
    });
    ws.on('error', reject);
  });

const nextMessage = (ws: WebSocket, ms = 2000) =>
  new Promise<RoomStateMessage>((resolve, reject) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    const timer = setTimeout(() => reject(new Error('message timeout')), ms);
    ws.once('close', () => clearTimeout(timer));
  });

const inboxes = new WeakMap<WebSocket, ServerMessage[]>();

const waitFor = async <T extends ServerMessage>(
  ws: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  ms = 3000
): Promise<T> => {
  let queue = inboxes.get(ws);
  if (!queue) {
    queue = [];
    inboxes.set(ws, queue);
    ws.on('message', (data) => queue?.push(JSON.parse(data.toString()) as ServerMessage));
  }
  const deadline = Date.now() + ms;
  for (;;) {
    const index = queue.findIndex(predicate);
    if (index >= 0) {
      return queue.splice(index, 1)[0] as T;
    }
    if (Date.now() > deadline) {
      throw new Error('waitFor timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('server app', () => {
  let server: import('node:http').Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, port } = await startServer());
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const ws of openSockets) {
      ws.terminate();
    }
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('health', () => {
    it('responds ok', async () => {
      const response = await fetch(`${baseUrl}/healthz`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  describe('tmdb proxy', () => {
    const originalKey = process.env.TMDB_API_KEY;
    // The proxy uses the global `fetch`; stubGlobal also intercepts this test's own
    // client requests, so capture the real implementation before stubbing.
    const realFetch = globalThis.fetch.bind(globalThis);

    afterEach(() => {
      vi.unstubAllGlobals();
      if (originalKey === undefined) {
        delete process.env.TMDB_API_KEY;
      } else {
        process.env.TMDB_API_KEY = originalKey;
      }
    });

    it('forwards allowed paths and injects the api key', async () => {
      process.env.TMDB_API_KEY = 'test-key';
      const upstream = vi.fn(async (_input: string | URL) => new Response('{"id":123}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      vi.stubGlobal('fetch', upstream);

      const response = await realFetch(`${baseUrl}/tmdb/person/123/movie_credits`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 123 });
      const calledUrl = new URL(upstream.mock.calls[0][0] as string);
      expect(calledUrl.pathname).toBe('/3/person/123/movie_credits');
      expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('strips a client-provided api_key', async () => {
      process.env.TMDB_API_KEY = 'test-key';
      const upstream = vi.fn(async (_input: string | URL) => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', upstream);

      await realFetch(`${baseUrl}/tmdb/search/person?query=tom&api_key=sneaky`);

      const calledUrl = new URL(upstream.mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
      expect(calledUrl.searchParams.get('query')).toBe('tom');
    });

    it('rejects paths outside the allowlist', async () => {
      process.env.TMDB_API_KEY = 'test-key';
      const upstream = vi.fn((_input: string | URL) => Promise.resolve(new Response('{}')));
      vi.stubGlobal('fetch', upstream);

      const response = await realFetch(`${baseUrl}/tmdb/configuration`);

      expect(response.status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    });

    it('returns 500 when the api key is missing', async () => {
      delete process.env.TMDB_API_KEY;

      const response = await realFetch(`${baseUrl}/tmdb/person/123`);

      expect(response.status).toBe(500);
    });

    it('answers preflight requests', async () => {
      const response = await realFetch(`${baseUrl}/tmdb/person/123`, { method: 'OPTIONS' });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  describe('race rooms rest', () => {
    it('creates a room and exposes a lobby peek', async () => {
      const created = await fetch(`${baseUrl}/race/rooms`, { method: 'POST' });
      expect(created.status).toBe(201);
      const { code } = (await created.json()) as { code: string };
      expect(code).toMatch(/^[A-Z2-9]{4}$/);

      const peek = await fetch(`${baseUrl}/race/rooms/${code}`);
      expect(await peek.json()).toEqual({ code, phase: 'lobby', playerCount: 0 });
    });

    it('404s for unknown rooms', async () => {
      const response = await fetch(`${baseUrl}/race/rooms/ZZZZ`);
      expect(response.status).toBe(404);
    });

    it('rate limits room creation per ip', async () => {
      const headers = { 'x-forwarded-for': '203.0.113.99' };
      for (let i = 0; i < 10; i += 1) {
        const response = await fetch(`${baseUrl}/race/rooms`, { method: 'POST', headers });
        expect(response.status).toBe(201);
      }
      const limited = await fetch(`${baseUrl}/race/rooms`, { method: 'POST', headers });
      expect(limited.status).toBe(429);
    });
  });

  describe('race room websocket', () => {
    it('runs the lobby join flow with host election and full-room rejection', async () => {
      const room = await (await fetch(`${baseUrl}/race/rooms`, { method: 'POST' })).json();
      const code = (room as { code: string }).code;

      const alice = await connectRoom(port, code);
      await alice.send(JSON.stringify({ type: 'join', playerId: 'p1', nickname: 'Alice' }));
      const aliceState = await nextMessage(alice);
      expect(aliceState.state.players).toEqual([{ playerId: 'p1', nickname: 'Alice', isHost: true }]);

      const bob = await connectRoom(port, code);
      const bobStatePromise = nextMessage(bob);
      const aliceSecondPromise = nextMessage(alice);
      await bob.send(JSON.stringify({ type: 'join', playerId: 'p2', nickname: 'Bob' }));
      expect((await bobStatePromise).state.players).toHaveLength(2);
      expect((await aliceSecondPromise).state.players).toHaveLength(2);

      const cara = await connectRoom(port, code);
      const caraResultPromise = nextMessage(cara);
      await cara.send(JSON.stringify({ type: 'join', playerId: 'p3', nickname: 'Cara' }));
      expect(await caraResultPromise).toEqual({ type: 'error', code: 'ROOM_FULL' });

      const aliceThirdPromise = nextMessage(alice);
      bob.close();
      const state = await aliceThirdPromise;
      expect(state.state.players).toHaveLength(1);

      alice.close();
    });

    it('rejects malformed messages and messages before joining', async () => {
      const room = await (await fetch(`${baseUrl}/race/rooms`, { method: 'POST' })).json();
      const code = (room as { code: string }).code;

      const socket = await connectRoom(port, code);
      const malformedPromise = nextMessage(socket);
      await socket.send('not json{');
      expect(await malformedPromise).toEqual({ type: 'error', code: 'MALFORMED_MESSAGE' });

      const beforeJoinPromise = nextMessage(socket);
      await socket.send(JSON.stringify({ type: 'progress', hops: 2 }));
      expect(await beforeJoinPromise).toEqual({ type: 'error', code: 'MUST_JOIN_FIRST' });

      socket.close();
    });

    it('destroys upgrade attempts for unknown rooms', async () => {
      await expect(connectRoom(port, 'ZZZZ')).rejects.toThrow();
    });
  });

  describe('race websocket flow', () => {
    const dealPair = () => ({
      start: { id: 1, name: 'Start', profile_path: null },
      target: { id: 9, name: 'Target', profile_path: null }
    });
    const getCredits = async (personId: number) => {
      const credits: Record<number, number[]> = { 1: [100], 2: [100, 200], 9: [200] };
      return new Set(credits[personId] ?? []);
    };

    let raceServer: import('node:http').Server;
    let racePort: number;
    let raceBase: string;
    let raceRoomStore: RoomStore;

    beforeAll(async () => {
      ({ server: raceServer, port: racePort, roomStore: raceRoomStore } = await startServer({
        dealPair,
        getCredits,
        roomDeps: { countdownMs: 20 },
        disconnectGraceMs: 30
      }));
      raceBase = `http://127.0.0.1:${racePort}`;
    });

    afterAll(async () => {
      for (const ws of openSockets) {
        ws.terminate();
      }
      raceServer.closeAllConnections?.();
      raceServer.closeIdleConnections?.();
      await new Promise<void>((resolve) => raceServer.close(() => resolve()));
    });

    const createRoom = async () => {
      const response = await fetch(`${raceBase}/race/rooms`, { method: 'POST' });
      return ((await response.json()) as { code: string }).code;
    };

    const joinRoom = (ws: WebSocket, playerId: string, nickname: string) =>
      ws.send(JSON.stringify({ type: 'join', playerId, nickname }));

    const setLobby = async (alice: WebSocket, bob: WebSocket) => {
      await joinRoom(alice, 'p1', 'Alice');
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState');
      await joinRoom(bob, 'p2', 'Bob');
      await waitFor<RoomStateMessage>(bob, (m) => m.type === 'roomState');
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.players.length === 2);
    };

    const raceToRacing = async (alice: WebSocket, bob: WebSocket) => {
      await setLobby(alice, bob);
      await alice.send(JSON.stringify({ type: 'start' }));
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.start !== null);
      await waitFor<CountdownMessage>(alice, (m) => m.type === 'countdown');
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.phase === 'racing');
      await waitFor<RoomStateMessage>(bob, (m) => m.type === 'roomState' && m.state.phase === 'racing');
    };

    it('runs start, progress, claim rejection, a valid claim and rematch', async () => {
      const code = await createRoom();
      const alice = await connectRoom(racePort, code);
      const bob = await connectRoom(racePort, code);

      await joinRoom(alice, 'p1', 'Alice');
      const aliceLobby = await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState');
      expect(aliceLobby.state.players).toHaveLength(1);

      await joinRoom(bob, 'p2', 'Bob');
      const aliceBoth = waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.players.length === 2);
      await waitFor<RoomStateMessage>(bob, (m) => m.type === 'roomState');
      await aliceBoth;

      await alice.send(JSON.stringify({ type: 'start' }));
      const started = await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.start !== null);
      expect(started.state.start?.id).toBe(1);
      expect(started.state.target?.id).toBe(9);
      await waitFor<CountdownMessage>(bob, (m) => m.type === 'countdown');
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.phase === 'racing');
      await waitFor<RoomStateMessage>(bob, (m) => m.type === 'roomState' && m.state.phase === 'racing');

      await alice.send(JSON.stringify({ type: 'progress', hops: 1, currentPersonName: 'Start' }));
      const progress = await waitFor<ProgressMessage>(bob, (m) => m.type === 'progress');
      expect(progress).toMatchObject({ type: 'progress', playerId: 'p1', hops: 1 });

      await alice.send(JSON.stringify({ type: 'claim', path: [1, 9] }));
      const rejection = await waitFor<ErrorMessage>(alice, (m) => m.type === 'error');
      expect(rejection.code).toBe('INVALID_CLAIM');

      await alice.send(JSON.stringify({ type: 'claim', path: [1, 2, 9] }));
      const finished = await waitFor<FinishedMessage>(bob, (m) => m.type === 'finished');
      expect(finished).toEqual({ type: 'finished', winnerId: 'p1', reason: 'claim', path: [1, 2, 9] });
      await waitFor<FinishedMessage>(alice, (m) => m.type === 'finished');

      await alice.send(JSON.stringify({ type: 'rematch' }));
      const lobby = await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState' && m.state.phase === 'lobby');
      expect(lobby.state.start).toBeNull();
    });

    it('forfeits a player who disconnects mid-race', async () => {
      const code = await createRoom();
      const alice = await connectRoom(racePort, code);
      const bob = await connectRoom(racePort, code);
      await raceToRacing(alice, bob);

      bob.close();

      const finished = await waitFor<FinishedMessage>(alice, (m) => m.type === 'finished');
      expect(finished.winnerId).toBe('p1');
      expect(finished.reason).toBe('forfeit');
    });

    it('ends the game for everyone when the host disconnects mid-race', async () => {
      const code = await createRoom();
      const alice = await connectRoom(racePort, code);
      const bob = await connectRoom(racePort, code);
      await raceToRacing(alice, bob);

      alice.close();

      const closed = await waitFor<RoomClosedMessage>(bob, (m) => m.type === 'roomClosed');
      expect(closed.reason).toBe('host_left');
      expect(raceRoomStore.get(code)).toBeNull();
    });

    it('keeps the race running when a guest leaves, then awards the host after grace', async () => {
      const code = await createRoom();
      const alice = await connectRoom(racePort, code);
      const bob = await connectRoom(racePort, code);
      await raceToRacing(alice, bob);

      await bob.send(JSON.stringify({ type: 'leave' }));
      await waitFor<RoomStateMessage>(alice, (m) => m.type === 'roomState');
      expect(raceRoomStore.get(code)?.phase).toBe('racing');

      const finished = await waitFor<FinishedMessage>(alice, (m) => m.type === 'finished');
      expect(finished.winnerId).toBe('p1');
      expect(finished.reason).toBe('forfeit');
    });

    it('migrates the host to the survivor when the host leaves the lobby', async () => {
      const code = await createRoom();
      const alice = await connectRoom(racePort, code);
      const bob = await connectRoom(racePort, code);
      await setLobby(alice, bob);

      await alice.send(JSON.stringify({ type: 'leave' }));

      const state = await waitFor<RoomStateMessage>(
        bob,
        (m) => m.type === 'roomState' && m.state.players.length === 1
      );
      expect(state.state.players[0]).toMatchObject({ playerId: 'p2', isHost: true });
    });
  });
});
