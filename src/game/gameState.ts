import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import puzzles from '../data/puzzles.json';
import pool from '../data/tmdbPool.json';
import { getPersonDetails } from '../api/tmdb';
import type { GameMode, Hop, MediaType, PersonId, PuzzleEntry, PuzzleHistoryEntry } from '../types/game';

type PersonPreview = {
  id: number;
  name: string;
  profile_path: string | null;
};

type ChosenMovie = {
  id: number;
  title: string;
  mediaType: MediaType;
};

type GameStore = {
  mode: GameMode;
  today: string;
  puzzle: PuzzleEntry | null;
  startPerson: PersonPreview | null;
  targetPerson: PersonPreview | null;
  path: PersonId[];
  hops: Hop[];
  maxHops: number;
  hasWon: boolean;
  hasLost: boolean;
  speedRunSeconds: number;
  speedRunStartedAt: number | null;
  streak: number;
  bestStreak: number;
  explorerWins: number;
  history: PuzzleHistoryEntry[];
  initialized: boolean;
  initMode: (mode: GameMode) => Promise<void>;
  addHop: (nextPersonId: PersonId, movie: ChosenMovie) => Promise<{ ok: boolean; reason?: string; hop?: Hop }>;
  undoHop: () => boolean;
  giveUp: () => boolean;
  tickSpeedRun: () => void;
  completeGame: (win: boolean) => Promise<void>;
  resetCurrentMode: () => Promise<void>;
  shareResult: () => string;
};

const HISTORY_KEY = 'cinelink:history';
const STREAK_KEY = 'cinelink:streak';
const BEST_STREAK_KEY = 'cinelink:best_streak';

const getTodayISO = () => new Date().toISOString().slice(0, 10);

const getPuzzleByDate = (date: string) => {
  return (puzzles as PuzzleEntry[]).find((entry) => entry.date === date) ?? null;
};

const randomPair = () => {
  const people = pool as { id: number; name: string }[];
  const first = people[Math.floor(Math.random() * people.length)];
  let second = people[Math.floor(Math.random() * people.length)];
  while (second.id === first.id) {
    second = people[Math.floor(Math.random() * people.length)];
  }
  return { first, second };
};

const loadStats = async () => {
  const [historyRaw, streakRaw, bestRaw] = await Promise.all([
    AsyncStorage.getItem(HISTORY_KEY),
    AsyncStorage.getItem(STREAK_KEY),
    AsyncStorage.getItem(BEST_STREAK_KEY)
  ]);

  let history: PuzzleHistoryEntry[] = [];
  if (historyRaw) {
    try {
      const parsed = JSON.parse(historyRaw);
      if (Array.isArray(parsed)) {
        history = parsed as PuzzleHistoryEntry[];
      }
    } catch {
      history = [];
    }
  }
  const streak = streakRaw ? Number(streakRaw) : 0;
  const bestStreak = bestRaw ? Number(bestRaw) : 0;

  return { history, streak: Number.isFinite(streak) ? streak : 0, bestStreak: Number.isFinite(bestStreak) ? bestStreak : 0 };
};

const saveStats = async (history: PuzzleHistoryEntry[], streak: number, bestStreak: number) => {
  await Promise.all([
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)),
    AsyncStorage.setItem(STREAK_KEY, String(streak)),
    AsyncStorage.setItem(BEST_STREAK_KEY, String(bestStreak))
  ]);
};

const toPreview = async (id: number, fallbackName?: string): Promise<PersonPreview> => {
  try {
    const data = await getPersonDetails(id);
    return { id: data.id, name: data.name, profile_path: data.profile_path };
  } catch {
    return { id, name: fallbackName ?? `Person ${id}`, profile_path: null };
  }
};

export const useGameState = create<GameStore>((set, get) => ({
  mode: 'daily',
  today: getTodayISO(),
  puzzle: null,
  startPerson: null,
  targetPerson: null,
  path: [],
  hops: [],
  maxHops: 6,
  hasWon: false,
  hasLost: false,
  speedRunSeconds: 0,
  speedRunStartedAt: null,
  streak: 0,
  bestStreak: 0,
  explorerWins: 0,
  history: [],
  initialized: false,

  initMode: async (mode) => {
    const today = getTodayISO();
    const stats = await loadStats();

    if (mode === 'daily') {
      const puzzle = getPuzzleByDate(today);
      const startPerson = puzzle ? await toPreview(puzzle.startId, puzzle.startName) : null;
      const targetPerson = puzzle ? await toPreview(puzzle.endId, puzzle.endName) : null;
      const playedToday = stats.history.find((entry) => entry.date === today && entry.mode === 'daily');
      const restoredHops = playedToday?.hops ?? [];
      const restoredPath =
        restoredHops.length > 0
          ? [restoredHops[0].fromPersonId, ...restoredHops.map((hop) => hop.toPersonId)]
          : puzzle
            ? [puzzle.startId]
            : [];

      set({
        mode,
        today,
        puzzle,
        startPerson,
        targetPerson,
        path: restoredPath,
        hops: restoredHops,
        hasWon: playedToday ? playedToday.win : false,
        hasLost: playedToday ? !playedToday.win : false,
        speedRunSeconds: 0,
        speedRunStartedAt: null,
        history: stats.history,
        streak: stats.streak,
        bestStreak: stats.bestStreak,
        initialized: true
      });
      return;
    }

    const { first, second } = randomPair();
    const startPerson = await toPreview(first.id, first.name);
    const targetPerson = await toPreview(second.id, second.name);

    set({
      mode,
      today,
      puzzle: null,
      startPerson,
      targetPerson,
      path: [first.id],
      hops: [],
      hasWon: false,
      hasLost: false,
      speedRunSeconds: 0,
      speedRunStartedAt: mode === 'speedrun' ? Date.now() : null,
      history: stats.history,
      streak: stats.streak,
      bestStreak: stats.bestStreak,
      initialized: true
    });
  },

  addHop: async (nextPersonId, movie) => {
    const state = get();
    if (state.hasWon || state.hasLost) {
      return { ok: false, reason: 'Game already finished' };
    }

    const previousPersonId = state.path[state.path.length - 1];
    if (previousPersonId === nextPersonId) {
      return { ok: false, reason: 'Cannot hop to the same person' };
    }

    const hop: Hop = {
      fromPersonId: previousPersonId,
      toPersonId: nextPersonId,
      sharedMediaType: movie.mediaType,
      sharedMediaId: movie.id,
      sharedMediaTitle: movie.title
    };

    const nextPath = [...state.path, nextPersonId];
    const nextHops = [...state.hops, hop];
    const reachedTarget = state.targetPerson?.id === nextPersonId;
    const exceededDaily = state.mode === 'daily' && nextHops.length >= state.maxHops && !reachedTarget;

    set({
      path: nextPath,
      hops: nextHops,
      hasWon: reachedTarget,
      hasLost: exceededDaily
    });

    if (reachedTarget) {
      await get().completeGame(true);
    } else if (exceededDaily) {
      await get().completeGame(false);
    }

    return { ok: true, hop };
  },

  undoHop: () => {
    const state = get();
    if (state.hasWon || state.hasLost || state.hops.length === 0) {
      return false;
    }
    set({
      path: state.path.slice(0, -1),
      hops: state.hops.slice(0, -1)
    });
    return true;
  },

  giveUp: () => {
    const state = get();
    if (state.hasWon || state.hasLost || state.mode === 'daily') {
      return false;
    }
    set({ hasLost: true });
    return true;
  },

  tickSpeedRun: () => {
    const { mode, speedRunStartedAt, hasWon, hasLost } = get();
    if (mode !== 'speedrun' || !speedRunStartedAt || hasWon || hasLost) {
      return;
    }
    const seconds = Math.floor((Date.now() - speedRunStartedAt) / 1000);
    set({ speedRunSeconds: seconds });
  },

  completeGame: async (win) => {
    const state = get();
    if (state.mode === 'explorer') {
      if (win) {
        set({ explorerWins: state.explorerWins + 1 });
      }
      return;
    }
    if (state.mode !== 'daily') {
      return;
    }

    const existingToday = state.history.find((h) => h.date === state.today && h.mode === 'daily');
    if (existingToday) {
      return;
    }

    const nextHistory: PuzzleHistoryEntry[] = [
      ...state.history,
      {
        date: state.today,
        mode: 'daily' as GameMode,
        win,
        hopsUsed: state.hops.length,
        completedAt: new Date().toISOString(),
        hops: state.hops
      }
    ].sort((a, b) => a.date.localeCompare(b.date));

    const streak = win ? state.streak + 1 : 0;
    const bestStreak = Math.max(state.bestStreak, streak);

    set({ history: nextHistory, streak, bestStreak });
    await saveStats(nextHistory, streak, bestStreak);
  },

  resetCurrentMode: async () => {
    await get().initMode(get().mode);
  },

  shareResult: () => {
    const state = get();
    const modeLabel = state.mode === 'daily' ? `Daily ${state.today}` : state.mode === 'speedrun' ? 'Speed Run' : 'Explorer';
    const symbols = state.hops.map(() => '🎬').join('→');
    const ending = state.hasWon ? '✅' : '❌';
    const hopsText = `${state.hops.length}${state.mode === 'daily' ? `/${state.maxHops}` : ''}`;
    return `CineLink ${modeLabel}\n${symbols ? `${symbols}→` : ''}${ending}\nHops: ${hopsText}`;
  }
}));
