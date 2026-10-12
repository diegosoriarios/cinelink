import { randomInt } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished';

export type PublicPlayer = {
  playerId: string;
  nickname: string;
  isHost: boolean;
};

export type RoomStateMessage = {
  type: 'roomState';
  state: {
    code: string;
    phase: RacePhase;
    players: PublicPlayer[];
  };
};

export type ServerMessage = RoomStateMessage | { type: 'error'; code: string };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const MAX_PLAYERS = 2;
const MAX_NICKNAME_LENGTH = 24;

export type ClientMessage = { type: string; playerId?: unknown; nickname?: unknown };

export const parseClientMessage = (raw: RawData): ClientMessage | null => {
  try {
    const parsed = JSON.parse(raw.toString()) as { type?: unknown };
    if (typeof parsed?.type !== 'string') {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
};

type Player = PublicPlayer & { socket: WebSocket };

const send = (socket: WebSocket, message: ServerMessage) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
};

export class RaceRoom {
  readonly code: string;
  phase: RacePhase = 'lobby';
  private players = new Map<string, Player>();

  constructor(code: string) {
    this.code = code;
  }

  get playerCount() {
    return this.players.size;
  }

  snapshot(): RoomStateMessage {
    return {
      type: 'roomState',
      state: {
        code: this.code,
        phase: this.phase,
        players: [...this.players.values()].map(({ playerId, nickname, isHost }) => ({ playerId, nickname, isHost }))
      }
    };
  }

  broadcast(message: ServerMessage) {
    for (const player of this.players.values()) {
      send(player.socket, message);
    }
  }

  broadcastRoomState() {
    this.broadcast(this.snapshot());
  }

  join(playerId: string, nickname: string, socket: WebSocket): { ok: true } | { ok: false; code: string } {
    const trimmed = nickname.trim();
    if (!playerId || typeof playerId !== 'string' || playerId.length > 64) {
      return { ok: false, code: 'INVALID_PLAYER_ID' };
    }
    if (!trimmed || trimmed.length > MAX_NICKNAME_LENGTH) {
      return { ok: false, code: 'INVALID_NICKNAME' };
    }

    const existing = this.players.get(playerId);
    if (existing) {
      existing.socket = socket;
      this.broadcastRoomState();
      return { ok: true };
    }

    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, code: 'ROOM_FULL' };
    }

    this.players.set(playerId, { playerId, nickname: trimmed, isHost: this.players.size === 0, socket });
    this.broadcastRoomState();
    return { ok: true };
  }

  leaveBySocket(socket: WebSocket): boolean {
    for (const [playerId, player] of this.players) {
      if (player.socket === socket) {
        this.players.delete(playerId);
        return true;
      }
    }
    return false;
  }
}

export class RoomStore {
  private rooms = new Map<string, RaceRoom>();

  createRoom(): RaceRoom {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new RaceRoom(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): RaceRoom | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  remove(code: string) {
    this.rooms.delete(code.toUpperCase());
  }
}
