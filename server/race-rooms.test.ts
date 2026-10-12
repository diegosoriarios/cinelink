import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { parseClientMessage, RaceRoom, RoomStore } from './race-rooms';

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

    expect(a.send).toHaveBeenCalledTimes(2);
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
