import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import puzzles from '../data/puzzles.json';
import pool from '../data/tmdbPool.json';
import { getPersonDetails } from '../api/tmdb';
import { getSharedMovies } from './validator';
import type { GameMode, Hop, PersonId, PuzzleEntry, PuzzleHistoryEntry } from '../types/game';

type PersonPreview = {
  id: number;
  name: string;
  profile_path: string | null;
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
  history: PuzzleHistoryEntry[];
  initialized: boolean;
  initMode: (mode: GameMode) => Promise<void>;
  addHop: (nextPersonId: PersonId) => Promise<{ ok: boolean; reason?: string; hop?: Hop }>;
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
  const people = pool as Array<{ id: number; name: string }>;
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

  const history = historyRaw ? (JSON.parse(historyRaw) as PuzzleHistoryEntry[]) : [];
  const streak = streakRaw ? Number(streakRaw) : 0;
  const bestStreak = bestRaw ? Number(bestRaw) : 0;

  return { history, streak, bestStreak };
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
  history: [],
  initialized: false,

  initMode: async (mode) => {
    const today = getTodayISO();
    const stats = await loadStats();

    if (mode === 'daily') {
      const puzzle = getPuzzleByDate(today);
      const startPerson = puzzle ? await toPreview(puzzle.startId, puzzle.startName) : null;
      const targetPerson = puzzle ? await toPreview(puzzle.endId, puzzle.endName) : null;
      set({
        mode,
        today,
        puzzle,
        startPerson,
        targetPerson,
        path: puzzle ? [puzzle.startId] : [],
        hops: [],
        hasWon: false,
        hasLost: false,
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

  addHop: async (nextPersonId) => {
    const state = get();
    if (state.hasWon || state.hasLost) {
      return { ok: false, reason: 'Game already finished' };
    }

    const previousPersonId = state.path[state.path.length - 1];
    if (previousPersonId === nextPersonId) {
      return { ok: false, reason: 'Cannot hop to the same person' };
    }

    const sharedMovies = await getSharedMovies(previousPersonId, nextPersonId);
    if (sharedMovies.length === 0) {
      return { ok: false, reason: 'No shared movie credits found' };
    }

    const chosenMovie = sharedMovies[0];
    const hop: Hop = {
      fromPersonId: previousPersonId,
      toPersonId: nextPersonId,
      sharedMovieId: chosenMovie.id,
      sharedMovieTitle: chosenMovie.title
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
        completedAt: new Date().toISOString()
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
