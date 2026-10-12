import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from './app';
import type { RoomStateMessage } from './race-rooms';

const startServer = async () => {
  const { server, roomStore } = createApp();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, port, roomStore };
};

const connectRoom = (port: number, code: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/race/rooms/${code}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });

const nextMessage = (ws: WebSocket, ms = 2000) =>
  new Promise<RoomStateMessage>((resolve, reject) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    const timer = setTimeout(() => reject(new Error('message timeout')), ms);
    ws.once('close', () => clearTimeout(timer));
  });

describe('server app', () => {
  let server: import('node:http').Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, port } = await startServer());
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
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

      const response = await fetch(`${baseUrl}/tmdb/person/123/movie_credits`);
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

      await fetch(`${baseUrl}/tmdb/search/person?query=tom&api_key=sneaky`);

      const calledUrl = new URL(upstream.mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
      expect(calledUrl.searchParams.get('query')).toBe('tom');
    });

    it('rejects paths outside the allowlist', async () => {
      process.env.TMDB_API_KEY = 'test-key';
      const upstream = vi.fn((_input: string | URL) => Promise.resolve(new Response('{}')));
      vi.stubGlobal('fetch', upstream);

      const response = await fetch(`${baseUrl}/tmdb/configuration`);

      expect(response.status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    });

    it('returns 500 when the api key is missing', async () => {
      delete process.env.TMDB_API_KEY;

      const response = await fetch(`${baseUrl}/tmdb/person/123`);

      expect(response.status).toBe(500);
    });

    it('answers preflight requests', async () => {
      const response = await fetch(`${baseUrl}/tmdb/person/123`, { method: 'OPTIONS' });

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
});
