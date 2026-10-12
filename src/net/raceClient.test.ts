import type { ServerMessage } from '../types/race';
import {
  createRaceRoom,
  getRaceBaseUrl,
  getRaceRoomSocketUrl,
  isRaceConfigured,
  normalizeRoomCode,
  peekRaceRoom,
  RaceSocket
} from './raceClient';

const ORIGINAL_ENV = process.env.EXPO_PUBLIC_RACE_URL;

afterEach(() => {
  process.env.EXPO_PUBLIC_RACE_URL = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('race url helpers', () => {
  it('trims trailing slashes from the base url', () => {
    process.env.EXPO_PUBLIC_RACE_URL = 'https://race.example.com/';
    expect(getRaceBaseUrl()).toBe('https://race.example.com');
    expect(isRaceConfigured()).toBe(true);
  });

  it('reports unconfigured when the env var is empty', () => {
    process.env.EXPO_PUBLIC_RACE_URL = '';
    expect(isRaceConfigured()).toBe(false);
    expect(getRaceBaseUrl()).toBe('');
  });

  it('derives a websocket url and uppercases the room code', () => {
    process.env.EXPO_PUBLIC_RACE_URL = 'https://race.example.com';
    expect(normalizeRoomCode(' abcd ')).toBe('ABCD');
    expect(getRaceRoomSocketUrl('abcd')).toBe('wss://race.example.com/race/rooms/ABCD/ws');
  });
});

describe('rest helpers', () => {
  it('creates a room and returns the code', async () => {
    process.env.EXPO_PUBLIC_RACE_URL = 'https://race.example.com';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ code: 'WXYZ' }) })) as unknown as typeof fetch;

    await expect(createRaceRoom()).resolves.toBe('WXYZ');
    expect(global.fetch).toHaveBeenCalledWith('https://race.example.com/race/rooms', { method: 'POST' });
  });

  it('peeks a room and returns null on 404', async () => {
    process.env.EXPO_PUBLIC_RACE_URL = 'https://race.example.com';
    global.fetch = jest.fn(async () => ({ status: 404, ok: false })) as unknown as typeof fetch;
    await expect(peekRaceRoom('abcd')).resolves.toBeNull();

    global.fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ code: 'ABCD', phase: 'lobby', playerCount: 1 })
    })) as unknown as typeof fetch;
    await expect(peekRaceRoom('abcd')).resolves.toEqual({ code: 'ABCD', phase: 'lobby', playerCount: 1 });
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('RaceSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
  });

  it('sends the join payload on open and forwards server messages', () => {
    const received: ServerMessage[] = [];
    const socket = new RaceSocket('ws://race/ws', {
      onMessage: (message) => received.push(message),
      onOpen: () => socket.send({ type: 'join', playerId: 'p1', nickname: 'Nia' })
    });

    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    expect(ws.url).toBe('ws://race/ws');
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'join', playerId: 'p1', nickname: 'Nia' });

    ws.emit({ type: 'countdown', endsAt: 999 });
    expect(received).toEqual([{ type: 'countdown', endsAt: 999 }]);
  });

  it('does not send while the socket is not open', () => {
    const socket = new RaceSocket('ws://race/ws', { onMessage: () => {} });
    socket.connect();
    socket.send({ type: 'start' });
    expect(FakeWebSocket.instances[0].sent).toEqual([]);
  });

  it('reconnects with backoff after an unexpected close', () => {
    jest.useFakeTimers();
    const socket = new RaceSocket('ws://race/ws', { onMessage: () => {} });
    socket.connect();

    FakeWebSocket.instances[0].close();
    expect(FakeWebSocket.instances).toHaveLength(1);

    jest.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    socket.close();
    jest.useRealTimers();
  });

  it('stops reconnecting once closed by the user', () => {
    jest.useFakeTimers();
    const socket = new RaceSocket('ws://race/ws', { onMessage: () => {} });
    socket.connect();
    socket.close();

    jest.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    jest.useRealTimers();
  });
});
