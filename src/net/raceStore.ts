import { create } from 'zustand';
import type { Hop, MovieLite, PersonId, PersonLite } from '../types/game';
import type { ClientMessage, RacePhase, RacePerson, RacePlayer, RaceResult, ServerMessage } from '../types/race';
import { getNickname, getPlayerId, persistNickname } from './identity';
import {
  createRaceRoom,
  getRaceRoomSocketUrl,
  isRaceConfigured,
  normalizeRoomCode,
  peekRaceRoom,
  RaceSocket
} from './raceClient';

export type RaceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type RaceState = {
  status: RaceStatus;
  configured: boolean;
  code: string | null;
  phase: RacePhase;
  players: RacePlayer[];
  selfId: string;
  nickname: string;
  personMap: Record<number, PersonLite>;
  startPerson: RacePerson | null;
  targetPerson: RacePerson | null;
  path: PersonId[];
  hops: Hop[];
  opponentHops: number;
  opponentName: string | null;
  countdownEndsAt: number | null;
  raceStartedAt: number | null;
  result: RaceResult | null;
  message: string | null;
};

type RaceActions = {
  hydrate: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leave: () => void;
  startRace: () => void;
  addHop: (person: PersonLite, movie: MovieLite) => { ok: boolean; reason?: string };
  undoHop: () => void;
  claim: () => void;
  rematch: () => void;
  handleMessage: (message: ServerMessage) => void;
};

export type RaceStore = RaceState & RaceActions;

const ERROR_MESSAGES: Record<string, string> = {
  ROOM_FULL: 'That room is already full.',
  INVALID_NICKNAME: 'Pick a nickname between 1 and 24 characters.',
  INVALID_PLAYER_ID: 'Something went wrong with your player id. Try reopening the app.',
  MALFORMED_MESSAGE: 'The race server rejected a message. Please try again.',
  MUST_JOIN_FIRST: 'Connection dropped. Reconnecting…',
  ROOM_NOT_FOUND: 'That room no longer exists.'
};

export const initialRaceState: RaceState = {
  status: 'idle',
  configured: isRaceConfigured(),
  code: null,
  phase: 'lobby',
  players: [],
  selfId: '',
  nickname: '',
  personMap: {},
  startPerson: null,
  targetPerson: null,
  path: [],
  hops: [],
  opponentHops: 0,
  opponentName: null,
  countdownEndsAt: null,
  raceStartedAt: null,
  result: null,
  message: null
};

const toPersonLite = (person: RacePerson): PersonLite => ({
  id: person.id,
  name: person.name,
  profile_path: person.profile_path
});

export const reduceRaceMessage = (state: RaceState, message: ServerMessage): Partial<RaceState> => {
  switch (message.type) {
    case 'roomState': {
      const { state: room } = message;
      const personMap = { ...state.personMap };
      if (room.start) {
        personMap[room.start.id] = toPersonLite(room.start);
      }
      if (room.target) {
        personMap[room.target.id] = toPersonLite(room.target);
      }
      const enteringRace = room.phase === 'racing' && state.raceStartedAt === null;
      const startPerson = room.start ?? state.startPerson;
      return {
        status: 'ready',
        code: room.code,
        phase: room.phase,
        players: room.players,
        startPerson,
        targetPerson: room.target ?? state.targetPerson,
        personMap,
        path: enteringRace && room.start ? [room.start.id] : state.path,
        hops: enteringRace ? [] : state.hops,
        raceStartedAt: enteringRace ? Date.now() : state.raceStartedAt
      };
    }
    case 'countdown':
      return { phase: 'countdown', countdownEndsAt: message.endsAt };
    case 'progress': {
      if (message.playerId === state.selfId) {
        return {};
      }
      const player = state.players.find((entry) => entry.playerId === message.playerId);
      return {
        opponentHops: message.hops,
        opponentName: player?.nickname ?? state.opponentName
      };
    }
    case 'finished':
      return {
        phase: 'finished',
        raceStartedAt: null,
        result: {
          winnerId: message.winnerId,
          reason: message.reason,
          path: message.path ?? null
        }
      };
    case 'error':
      return { message: ERROR_MESSAGES[message.code] ?? `Race error: ${message.code}` };
    default:
      return {};
  }
};

let socket: RaceSocket | null = null;

const closeSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
};

export const useRaceStore = create<RaceStore>((set, get) => ({
  ...initialRaceState,

  hydrate: async () => {
    const [selfId, nickname] = await Promise.all([getPlayerId(), getNickname()]);
    set({ selfId, nickname, configured: isRaceConfigured() });
  },

  updateNickname: async (nickname) => {
    const trimmed = nickname.trim();
    await persistNickname(trimmed);
    set({ nickname: trimmed });
  },

  createRoom: async () => {
    if (!isRaceConfigured()) {
      set({ status: 'error', message: 'Multiplayer is not configured on this build.' });
      return;
    }
    if (!get().nickname.trim()) {
      set({ status: 'error', message: 'Pick a nickname first.' });
      return;
    }
    set({ status: 'loading', message: null });
    try {
      const code = await createRaceRoom();
      await get().joinRoom(code);
    } catch (error) {
      set({ status: 'error', message: error instanceof Error ? error.message : 'Could not create a room.' });
    }
  },

  joinRoom: async (code) => {
    if (!isRaceConfigured()) {
      set({ status: 'error', message: 'Multiplayer is not configured on this build.' });
      return;
    }
    const normalized = normalizeRoomCode(code);
    if (normalized.length !== 4) {
      set({ status: 'error', message: 'Enter the 4-character room code.' });
      return;
    }
    const nickname = get().nickname.trim();
    if (!nickname) {
      set({ status: 'error', message: 'Pick a nickname first.' });
      return;
    }
    set({ status: 'loading', message: null });
    try {
      const peek = await peekRaceRoom(normalized);
      if (!peek) {
        set({ status: 'error', message: 'No room found with that code.' });
        return;
      }
      closeSocket();
      set({
        ...initialRaceState,
        configured: true,
        selfId: get().selfId,
        nickname: get().nickname,
        status: 'ready',
        code: normalized
      });
      socket = new RaceSocket(getRaceRoomSocketUrl(normalized), {
        onMessage: (message) => get().handleMessage(message),
        onOpen: () => {
          const payload: ClientMessage = { type: 'join', playerId: get().selfId, nickname: get().nickname };
          socket?.send(payload);
        }
      });
      socket.connect();
    } catch (error) {
      set({ status: 'error', message: error instanceof Error ? error.message : 'Could not join the room.' });
    }
  },

  leave: () => {
    socket?.send({ type: 'leave' });
    closeSocket();
    set({ ...initialRaceState, configured: get().configured, selfId: get().selfId, nickname: get().nickname });
  },

  startRace: () => {
    socket?.send({ type: 'start' });
  },

  addHop: (person, movie) => {
    const { phase, path, hops, personMap } = get();
    if (phase !== 'racing') {
      return { ok: false, reason: 'The race has not started yet.' };
    }
    const previous = path[path.length - 1];
    if (previous === person.id) {
      return { ok: false, reason: 'Cannot hop to the same person' };
    }
    const hop: Hop = {
      fromPersonId: previous,
      toPersonId: person.id,
      sharedMovieId: movie.id,
      sharedMovieTitle: movie.title
    };
    const nextPath = [...path, person.id];
    const nextHops = [...hops, hop];
    set({ path: nextPath, hops: nextHops, personMap: { ...personMap, [person.id]: person } });
    socket?.send({ type: 'progress', hops: nextHops.length, currentPersonName: person.name });
    return { ok: true };
  },

  undoHop: () => {
    const { phase, path, hops } = get();
    if (phase !== 'racing' || hops.length === 0) {
      return;
    }
    const nextPath = path.slice(0, -1);
    const nextHops = hops.slice(0, -1);
    set({ path: nextPath, hops: nextHops });
    const currentId = nextPath[nextPath.length - 1];
    socket?.send({ type: 'progress', hops: nextHops.length, currentPersonName: get().personMap[currentId]?.name ?? null });
  },

  claim: () => {
    socket?.send({ type: 'claim', path: get().path });
  },

  rematch: () => {
    socket?.send({ type: 'rematch' });
    set({ path: [], hops: [], result: null, opponentHops: 0, countdownEndsAt: null, message: null, phase: 'lobby' });
  },

  handleMessage: (message) => {
    set((state) => reduceRaceMessage(state, message));
  }
}));
