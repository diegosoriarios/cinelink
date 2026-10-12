import type { PersonId } from './game';

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished';

export type RacePlayer = {
  playerId: string;
  nickname: string;
  isHost: boolean;
};

export type RacePerson = {
  id: PersonId;
  name: string;
  profile_path: string | null;
};

export type RaceResult = {
  winnerId: string | null;
  reason: string;
  path: PersonId[] | null;
};

export type RoomState = {
  code: string;
  phase: RacePhase;
  players: RacePlayer[];
  start?: RacePerson | null;
  target?: RacePerson | null;
};

export type ServerMessage =
  | { type: 'roomState'; state: RoomState }
  | { type: 'countdown'; endsAt: number }
  | { type: 'progress'; playerId: string; hops: number; currentPersonName?: string | null }
  | { type: 'finished'; winnerId: string | null; reason: string; path?: PersonId[] | null }
  | { type: 'roomClosed'; reason: string }
  | { type: 'error'; code: string };

export type ClientMessage =
  | { type: 'join'; playerId: string; nickname: string }
  | { type: 'start' }
  | { type: 'progress'; hops: number; currentPersonName: string | null }
  | { type: 'claim'; path: PersonId[] }
  | { type: 'rematch' }
  | { type: 'leave' };
