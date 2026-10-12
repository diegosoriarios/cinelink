import { describe, expect, it, vi, afterEach } from 'vitest';
import type { WebSocket } from 'ws';
import { DEFAULT_COUNTDOWN_MS, parseClientMessage, RaceRoom, RoomStore, type RaceRoomDeps } from './race-rooms';

const fakeSocket = () => ({ readyState: 1, OPEN: 1, send: vi.fn() }) as unknown as WebSocket;

describe('RoomStore', () => {
  it('creates rooms with unique 4-char codes', () => {
    const store = new RoomStore();
    const codes = new Set(Array.from({ length: 50 }, () => store.createRoom().code));

    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}$/);
    }
  });

  it('looks rooms up case-insensitively', () => {
    const store = new RoomStore();
    const room = store.createRoom();
    expect(store.get(room.code.toLowerCase())?.code).toBe(room.code);
  });
});

describe('RaceRoom.join', () => {
  it('makes the first player host and the second a guest', () => {
    const room = new RaceRoom('ABCD');
    const socketA = fakeSocket();
    const socketB = fakeSocket();

    expect(room.join('p1', 'Alice', socketA)).toEqual({ ok: true });
    expect(room.join('p2', 'Bob', socketB)).toEqual({ ok: true });

    const snapshot = room.snapshot();
    expect(snapshot.state.phase).toBe('lobby');
    expect(snapshot.state.players).toEqual([
      { playerId: 'p1', nickname: 'Alice', isHost: true },
      { playerId: 'p2', nickname: 'Bob', isHost: false }
    ]);
  });

  it('rejects empty or oversized nicknames and player ids', () => {
    const room = new RaceRoom('ABCD');
    expect(room.join('p1', '   ', fakeSocket())).toEqual({ ok: false, code: 'INVALID_NICKNAME' });
    expect(room.join('p1', 'x'.repeat(25), fakeSocket())).toEqual({ ok: false, code: 'INVALID_NICKNAME' });
    expect(room.join('', 'Alice', fakeSocket())).toEqual({ ok: false, code: 'INVALID_PLAYER_ID' });
    expect(room.join('x'.repeat(65), 'Alice', fakeSocket())).toEqual({ ok: false, code: 'INVALID_PLAYER_ID' });
  });

  it('rejects a third distinct player when the room is full', () => {
    const room = new RaceRoom('ABCD');
    room.join('p1', 'Alice', fakeSocket());
    room.join('p2', 'Bob', fakeSocket());

    expect(room.join('p3', 'Cara', fakeSocket())).toEqual({ ok: false, code: 'ROOM_FULL' });
    expect(room.playerCount).toBe(2);
  });

  it('replaces the socket when a known player reconnects and keeps host status', () => {
    const room = new RaceRoom('ABCD');
    const original = fakeSocket();
    const replacement = fakeSocket();
    room.join('p1', 'Alice', original);
    room.join('p1', 'Alice', replacement);

    expect(room.playerCount).toBe(1);
    expect(room.snapshot().state.players[0].isHost).toBe(true);
  });

  it('trims nicknames', () => {
    const room = new RaceRoom('ABCD');
    room.join('p1', '  Alice  ', fakeSocket());

    expect(room.snapshot().state.players[0].nickname).toBe('Alice');
  });
});

describe('RaceRoom.broadcast', () => {
  it('sends to every open socket', () => {
    const room = new RaceRoom('ABCD');
    const a = fakeSocket();
    const b = fakeSocket();
    room.join('p1', 'Alice', a);
    room.join('p2', 'Bob', b);

    room.broadcastRoomState();

    // Alice: 1 roomState per join (2) + explicit broadcast (1) = 3.
    // Bob: 1 roomState on his join (broadcast) + explicit broadcast = 2.
    expect(a.send).toHaveBeenCalledTimes(3);
    expect(b.send).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(vi.mocked(a.send).mock.calls[1][0] as string);
    expect(payload.type).toBe('roomState');
    expect(payload.state.players).toHaveLength(2);
  });
});

describe('RaceRoom.leaveBySocket', () => {
  it('removes the player that owns the socket', () => {
    const room = new RaceRoom('ABCD');
    const socket = fakeSocket();
    room.join('p1', 'Alice', socket);

    expect(room.leaveBySocket(socket)).toBe(true);
    expect(room.playerCount).toBe(0);
    expect(room.leaveBySocket(fakeSocket())).toBe(false);
  });
});

describe('parseClientMessage', () => {
  it('parses valid json with a type', () => {
    expect(parseClientMessage(Buffer.from(JSON.stringify({ type: 'join' })))).toEqual({ type: 'join' });
  });

  it('returns null for malformed payloads', () => {
    expect(parseClientMessage(Buffer.from('not json{'))).toBeNull();
    expect(parseClientMessage(Buffer.from(JSON.stringify({ nope: true })))).toBeNull();
  });
});

const START_PERSON = { id: 1, name: 'Start', profile_path: null };
const TARGET_PERSON = { id: 9, name: 'Target', profile_path: null };
const fixedDealer = () => ({ start: START_PERSON, target: TARGET_PERSON });

describe('RaceRoom race flow', () => {
  const makeRoom = (deps: Partial<RaceRoomDeps> = {}) => new RaceRoom('ABCD', { dealer: fixedDealer, ...deps });

  const seatTwo = (room: RaceRoom) => {
    const a = fakeSocket();
    const b = fakeSocket();
    room.join('p1', 'Alice', a);
    room.join('p2', 'Bob', b);
    return { a, b };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires the host and both players before starting', () => {
    const room = makeRoom();
    room.join('p1', 'Alice', fakeSocket());

    expect(room.startRace('p1')).toEqual({ ok: false, code: 'NEED_MORE_PLAYERS' });

    room.join('p2', 'Bob', fakeSocket());
    expect(room.startRace('p2')).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(room.phase).toBe('lobby');
  });

  it('deals a pair, exposes it in roomState and counts down into racing', () => {
    vi.useFakeTimers();
    const room = makeRoom();
    seatTwo(room);

    expect(room.startRace('p1')).toEqual({ ok: true });
    const state = room.snapshot().state;
    expect(state.start).toEqual(START_PERSON);
    expect(state.target).toEqual(TARGET_PERSON);
    expect(room.phase).toBe('countdown');

    vi.advanceTimersByTime(DEFAULT_COUNTDOWN_MS);
    expect(room.phase).toBe('racing');
  });

  it('broadcasts progress to every player', () => {
    const room = makeRoom();
    const { a, b } = seatTwo(room);
    room.startRace('p1');
    vi.mocked(a.send).mockClear();
    vi.mocked(b.send).mockClear();

    expect(room.recordProgress('p1', 3.7, 'Somebody')).toBe(true);

    const payload = JSON.parse(vi.mocked(b.send).mock.calls[0][0] as string);
    expect(payload).toEqual({ type: 'progress', playerId: 'p1', hops: 3, currentPersonName: 'Somebody' });
  });

  it('awards the fewest hops on timeout', () => {
    vi.useFakeTimers();
    const room = makeRoom({ raceDurationMs: 100 });
    const { a } = seatTwo(room);
    room.startRace('p1');
    vi.advanceTimersByTime(DEFAULT_COUNTDOWN_MS);
    room.recordProgress('p1', 1, null);
    room.recordProgress('p2', 3, null);
    vi.mocked(a.send).mockClear();

    vi.advanceTimersByTime(100);

    expect(room.phase).toBe('finished');
    const finished = JSON.parse(vi.mocked(a.send).mock.calls.at(-1)?.[0] as string);
    expect(finished).toEqual({ type: 'finished', winnerId: 'p1', reason: 'timeout', path: null });
  });

  it('declares a draw when hops are tied at timeout', () => {
    vi.useFakeTimers();
    const room = makeRoom({ raceDurationMs: 100 });
    const { a } = seatTwo(room);
    room.startRace('p1');
    vi.advanceTimersByTime(DEFAULT_COUNTDOWN_MS);
    room.recordProgress('p1', 2, null);
    room.recordProgress('p2', 2, null);
    vi.mocked(a.send).mockClear();

    vi.advanceTimersByTime(100);

    const finished = JSON.parse(vi.mocked(a.send).mock.calls.at(-1)?.[0] as string);
    expect(finished.winnerId).toBeNull();
    expect(finished.reason).toBe('draw');
  });

  it('ignores double finishes and resets to the lobby on rematch', () => {
    const room = makeRoom();
    seatTwo(room);
    room.startRace('p1');

    expect(room.finish('p1', 'claim', [1, 9])).toBe(true);
    expect(room.finish('p2', 'claim', [1, 9])).toBe(false);
    expect(room.phase).toBe('finished');

    expect(room.resetForRematch()).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.snapshot().state.start).toBeNull();
    expect(room.snapshot().state.target).toBeNull();
  });

  it('tracks connected players and forfeit targets on disconnect', () => {
    const room = makeRoom();
    const { b } = seatTwo(room);
    room.startRace('p1');
    expect(room.connectedCount).toBe(2);

    expect(room.leaveBySocket(b)).toBe(true);
    expect(room.connectedCount).toBe(1);
    expect(room.playerCount).toBe(2);
    expect(room.otherPlayerId('p1')).toBe('p2');
    expect(room.isConnected('p2')).toBe(false);

    room.join('p2', 'Bob', fakeSocket());
    expect(room.isConnected('p2')).toBe(true);
  });
});
