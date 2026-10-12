import { randomInt } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import { dealPair, type RacePerson } from './pool';
import type { PersonId } from '../src/types/game';

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
    start: RacePerson | null;
    target: RacePerson | null;
  };
};

export type CountdownMessage = { type: 'countdown'; endsAt: number };
export type ProgressMessage = {
  type: 'progress';
  playerId: string;
  hops: number;
  currentPersonName: string | null;
};
export type FinishedMessage = {
  type: 'finished';
  winnerId: string | null;
  reason: string;
  path: PersonId[] | null;
};
export type ErrorMessage = { type: 'error'; code: string };
export type RoomClosedMessage = { type: 'roomClosed'; reason: string };

export type ServerMessage =
  | RoomStateMessage
  | CountdownMessage
  | ProgressMessage
  | FinishedMessage
  | ErrorMessage
  | RoomClosedMessage;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const MAX_PLAYERS = 2;
const MAX_NICKNAME_LENGTH = 24;

export const DEFAULT_COUNTDOWN_MS = 3_000;
export const DEFAULT_RACE_DURATION_MS = 5 * 60 * 1_000;

export type ClientMessage = {
  type: string;
  playerId?: unknown;
  nickname?: unknown;
  hops?: unknown;
  currentPersonName?: unknown;
  path?: unknown;
};

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

type TimerHandle = ReturnType<typeof setTimeout>;

export type RaceTimers = {
  setTimeout: (handler: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  now: () => number;
};

const defaultTimers: RaceTimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => Date.now()
};

export type RaceDealer = () => { start: RacePerson; target: RacePerson };

export type RaceRoomDeps = {
  dealer?: RaceDealer;
  timers?: RaceTimers;
  countdownMs?: number;
  raceDurationMs?: number;
};

type Player = PublicPlayer & {
  socket: WebSocket | null;
  connected: boolean;
  hops: number;
  currentPersonName: string | null;
};

const send = (socket: WebSocket | null, message: ServerMessage) => {
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
};

export class RaceRoom {
  readonly code: string;
  phase: RacePhase = 'lobby';
  startPerson: RacePerson | null = null;
  targetPerson: RacePerson | null = null;

  private players = new Map<string, Player>();
  private countdownTimer: TimerHandle | null = null;
  private raceTimer: TimerHandle | null = null;
  private raceEndsAt: number | null = null;
  private closed = false;

  private readonly dealer: RaceDealer;
  private readonly timers: RaceTimers;
  private readonly countdownMs: number;
  private readonly raceDurationMs: number;

  constructor(code: string, deps: RaceRoomDeps = {}) {
    this.code = code;
    this.dealer = deps.dealer ?? dealPair;
    this.timers = deps.timers ?? defaultTimers;
    this.countdownMs = deps.countdownMs ?? DEFAULT_COUNTDOWN_MS;
    this.raceDurationMs = deps.raceDurationMs ?? DEFAULT_RACE_DURATION_MS;
  }

  get playerCount() {
    return this.players.size;
  }

  get connectedCount() {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.connected) {
        count += 1;
      }
    }
    return count;
  }

  get hostId(): string | null {
    for (const player of this.players.values()) {
      if (player.isHost) {
        return player.playerId;
      }
    }
    return null;
  }

  snapshot(): RoomStateMessage {
    return {
      type: 'roomState',
      state: {
        code: this.code,
        phase: this.phase,
        players: [...this.players.values()].map(({ playerId, nickname, isHost }) => ({ playerId, nickname, isHost })),
        start: this.startPerson,
        target: this.targetPerson
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
      existing.connected = true;
      this.broadcastRoomState();
      return { ok: true };
    }

    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, code: 'ROOM_FULL' };
    }

    this.players.set(playerId, {
      playerId,
      nickname: trimmed,
      isHost: this.players.size === 0,
      socket,
      connected: true,
      hops: 0,
      currentPersonName: null
    });
    this.broadcastRoomState();
    return { ok: true };
  }

  leaveBySocket(socket: WebSocket): boolean {
    for (const [playerId, player] of this.players) {
      if (player.socket === socket) {
        if (this.phase === 'lobby') {
          this.players.delete(playerId);
          this.ensureHost();
        } else {
          player.connected = false;
          player.socket = null;
        }
        return true;
      }
    }
    return false;
  }

  removePlayer(playerId: string): boolean {
    const removed = this.players.delete(playerId);
    if (removed) {
      this.ensureHost();
    }
    return removed;
  }

  markDisconnected(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }
    player.connected = false;
    player.socket = null;
    return true;
  }

  ensureHost(): void {
    if (this.hostId) {
      return;
    }
    const first = this.players.values().next().value;
    if (first) {
      first.isHost = true;
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(reason: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clearTimers();
    this.broadcast({ type: 'roomClosed', reason });
    for (const player of this.players.values()) {
      const socket = player.socket;
      player.socket = null;
      player.connected = false;
      socket?.close();
    }
  }

  isHost(playerId: string): boolean {
    return this.players.get(playerId)?.isHost ?? false;
  }

  isConnected(playerId: string): boolean {
    return this.players.get(playerId)?.connected ?? false;
  }

  playerIdBySocket(socket: WebSocket): string | null {
    for (const [playerId, player] of this.players) {
      if (player.socket === socket) {
        return playerId;
      }
    }
    return null;
  }

  otherPlayerId(playerId: string): string | null {
    for (const id of this.players.keys()) {
      if (id !== playerId) {
        return id;
      }
    }
    return null;
  }

  startRace(requesterId: string): { ok: true } | { ok: false; code: string } {
    if (this.phase !== 'lobby') {
      return { ok: false, code: 'RACE_ALREADY_STARTED' };
    }
    const requester = this.players.get(requesterId);
    if (!requester) {
      return { ok: false, code: 'MUST_JOIN_FIRST' };
    }
    if (!requester.isHost) {
      return { ok: false, code: 'NOT_HOST' };
    }
    if (this.players.size < MAX_PLAYERS) {
      return { ok: false, code: 'NEED_MORE_PLAYERS' };
    }

    const { start, target } = this.dealer();
    this.startPerson = start;
    this.targetPerson = target;
    for (const player of this.players.values()) {
      player.hops = 0;
      player.currentPersonName = null;
    }

    this.phase = 'countdown';
    const endsAt = this.timers.now() + this.countdownMs;
    this.broadcastRoomState();
    this.broadcast({ type: 'countdown', endsAt });
    this.countdownTimer = this.timers.setTimeout(() => this.beginRacing(), this.countdownMs);
    return { ok: true };
  }

  recordProgress(playerId: string, hops: number, currentPersonName: string | null): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }
    const safeHops = Number.isFinite(hops) ? Math.max(0, Math.floor(hops)) : 0;
    player.hops = safeHops;
    player.currentPersonName = currentPersonName;
    this.broadcast({ type: 'progress', playerId, hops: safeHops, currentPersonName });
    return true;
  }

  finish(winnerId: string | null, reason: string, path: PersonId[] | null): boolean {
    if (this.phase === 'finished') {
      return false;
    }
    this.phase = 'finished';
    this.clearTimers();
    this.broadcast({ type: 'finished', winnerId, reason, path });
    return true;
  }

  timeoutFinish(): boolean {
    if (this.phase !== 'racing') {
      return false;
    }
    const ranked = [...this.players.values()].filter((player) => player.connected).sort((a, b) => a.hops - b.hops);
    if (ranked.length < 2) {
      const winner = ranked[0]?.playerId ?? null;
      return this.finish(winner, winner ? 'timeout' : 'draw', null);
    }
    if (ranked[0].hops < ranked[1].hops) {
      return this.finish(ranked[0].playerId, 'timeout', null);
    }
    return this.finish(null, 'draw', null);
  }

  resetForRematch(): boolean {
    if (this.phase !== 'finished') {
      return false;
    }
    this.clearTimers();
    this.phase = 'lobby';
    this.startPerson = null;
    this.targetPerson = null;
    for (const player of this.players.values()) {
      player.hops = 0;
      player.currentPersonName = null;
    }
    this.broadcastRoomState();
    return true;
  }

  private beginRacing() {
    if (this.phase !== 'countdown') {
      return;
    }
    this.countdownTimer = null;
    this.phase = 'racing';
    this.raceEndsAt = this.timers.now() + this.raceDurationMs;
    this.broadcastRoomState();
    this.raceTimer = this.timers.setTimeout(() => this.timeoutFinish(), this.raceDurationMs);
  }

  private clearTimers() {
    if (this.countdownTimer) {
      this.timers.clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.raceTimer) {
      this.timers.clearTimeout(this.raceTimer);
      this.raceTimer = null;
    }
    this.raceEndsAt = null;
  }
}

export class RoomStore {
  private rooms = new Map<string, RaceRoom>();

  createRoom(options: RaceRoomDeps = {}): RaceRoom {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new RaceRoom(code, options);
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
