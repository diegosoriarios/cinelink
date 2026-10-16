import { getPersonDetails } from '../api/tmdb';
import pool from '../data/tmdbPool.json';
import puzzles from '../data/puzzles.json';
import { useGameState } from './gameState';
import type { PuzzleEntry } from '../types/game';

jest.mock('../api/tmdb', () => ({
  getPersonDetails: jest.fn()
}));

const mockedGetPersonDetails = getPersonDetails as jest.MockedFunction<typeof getPersonDetails>;

const DAILY_DATE = '2026-05-05';
const NEXT_DATE = '2026-05-06';
const LOSS_DATE = '2026-05-07';

const movieFor = (id: number) => ({ id: 9000 + id, title: `Movie ${id}`, mediaType: 'movie' as const });

const puzzleList = puzzles as PuzzleEntry[];
const puzzleOf = (date: string) => puzzleList.find((p) => p.date === date)!;

const storage = () => (globalThis as unknown as { __mockAsyncStorageStore: Map<string, string> }).__mockAsyncStorageStore;
const resetStorage = () => (globalThis as unknown as { __resetMockAsyncStorage: () => void }).__resetMockAsyncStorage();

const useDate = (date: string) => {
  jest.useFakeTimers({ now: new Date(`${date}T12:00:00Z`) });
};

const state = () => useGameState.getState();

beforeEach(() => {
  resetStorage();

  mockedGetPersonDetails.mockImplementation(async (id: number) => {
    const puzzle = puzzleList.find((p) => p.startId === id || p.endId === id);
    return {
      id,
      name: puzzle && puzzle.startId === id ? puzzle.startName : puzzle && puzzle.endId === id ? puzzle.endName : `Person ${id}`,
      biography: '',
      birthday: null,
      known_for_department: 'Acting',
      place_of_birth: null,
      profile_path: `/p${id}.jpg`,
      popularity: 1
    };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initMode daily', () => {
  it('loads the puzzle for today and resolves person previews', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    const puzzle = puzzleOf(DAILY_DATE);
    expect(state().puzzle?.date).toBe(DAILY_DATE);
    expect(state().startPerson?.id).toBe(puzzle.startId);
    expect(state().startPerson?.name).toBe(puzzle.startName);
    expect(state().targetPerson?.id).toBe(puzzle.endId);
    expect(state().targetPerson?.name).toBe(puzzle.endName);
    expect(state().path).toEqual([puzzle.startId]);
    expect(state().maxHops).toBe(6);
    expect(state().initialized).toBe(true);
    expect(state().hasWon).toBe(false);
    expect(state().hasLost).toBe(false);
  });

  it('marks initialized with a null puzzle when today has no puzzle', async () => {
    useDate('2027-01-01');
    await state().initMode('daily');

    expect(state().puzzle).toBeNull();
    expect(state().startPerson).toBeNull();
    expect(state().targetPerson).toBeNull();
    expect(state().initialized).toBe(true);
  });
});

describe('stats resilience', () => {
  it('falls back to empty stats when stored values are corrupted', async () => {
    useDate(DAILY_DATE);
    storage().set('cinelink:history', 'not-json{');
    storage().set('cinelink:streak', 'oops');
    storage().set('cinelink:best_streak', '');

    await state().initMode('daily');

    expect(state().history).toEqual([]);
    expect(state().streak).toBe(0);
    expect(state().bestStreak).toBe(0);
  });

  it('falls back to empty history when stored history is not an array', async () => {
    useDate(DAILY_DATE);
    storage().set('cinelink:history', JSON.stringify({ corrupted: true }));

    await state().initMode('daily');

    expect(state().history).toEqual([]);
  });

  it('records a clean result after recovering from corrupted stats', async () => {
    useDate(DAILY_DATE);
    storage().set('cinelink:history', 'not-json{');
    await state().initMode('daily');

    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));

    expect(state().history).toHaveLength(1);
    expect(state().streak).toBe(1);
  });
});

describe('initMode explorer and speedrun', () => {
  it('picks two distinct people from the pool', async () => {
    await state().initMode('explorer');

    const { startPerson, targetPerson } = state();
    expect(startPerson).not.toBeNull();
    expect(targetPerson).not.toBeNull();
    expect(startPerson!.id).not.toBe(targetPerson!.id);
    expect((pool as { id: number }[]).some((p) => p.id === startPerson!.id)).toBe(true);
  });

  it('starts the speedrun clock', async () => {
    await state().initMode('speedrun');
    expect(state().speedRunStartedAt).not.toBeNull();
  });

  it('ticks elapsed speedrun time and freezes when the game is over', async () => {
    await state().initMode('speedrun');
    const startedAt = state().speedRunStartedAt!;
    useGameState.setState({ speedRunStartedAt: startedAt - 65000 });

    state().tickSpeedRun();
    expect(state().speedRunSeconds).toBe(65);

    useGameState.setState({ hasWon: true });
    state().tickSpeedRun();
    expect(state().speedRunSeconds).toBe(65);
  });
});

describe('addHop', () => {
  it('rejects hopping to the same person', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    const startId = state().path[0];
    await expect(state().addHop(startId, movieFor(startId))).resolves.toMatchObject({ ok: false, reason: 'Cannot hop to the same person' });
    expect(state().path).toHaveLength(1);
  });

  it('records the explicitly chosen movie on the hop', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    const result = await state().addHop(201, { id: 4444, title: 'Chosen Feature', mediaType: 'movie' });
    expect(result.ok).toBe(true);
    expect(result.hop).toMatchObject({
      fromPersonId: puzzleOf(DAILY_DATE).startId,
      toPersonId: 201,
      sharedMediaType: 'movie',
      sharedMediaId: 4444,
      sharedMediaTitle: 'Chosen Feature'
    });
    expect(state().path).toEqual([puzzleOf(DAILY_DATE).startId, 201]);
    expect(state().hasLost).toBe(false);
  });

  it('accepts a valid non-target hop and records the shared movie', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    const result = await state().addHop(201, movieFor(201));
    expect(result.ok).toBe(true);
    expect(result.hop?.sharedMediaTitle).toBe('Movie 201');
    expect(state().path).toEqual([puzzleOf(DAILY_DATE).startId, 201]);
    expect(state().hasWon).toBe(false);
    expect(state().hasLost).toBe(false);
  });

  it('wins when reaching the target and records the daily result', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));

    expect(state().hasWon).toBe(true);
    expect(state().streak).toBe(1);
    expect(state().bestStreak).toBe(1);
    expect(state().history).toHaveLength(1);
    expect(state().history[0]).toMatchObject({ date: DAILY_DATE, mode: 'daily', win: true, hopsUsed: 1 });
    expect(storage().get('cinelink:streak')).toBe('1');
    expect(storage().get('cinelink:best_streak')).toBe('1');
  });

  it('loses after maxHops without reaching the target and resets the streak', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    for (let hop = 1; hop <= state().maxHops; hop += 1) {
      await state().addHop(200 + hop, movieFor(200 + hop));
    }

    expect(state().hasLost).toBe(true);
    expect(state().path).toHaveLength(state().maxHops + 1);
    expect(state().streak).toBe(0);
    expect(state().history).toHaveLength(1);
    expect(state().history[0]).toMatchObject({ date: DAILY_DATE, win: false, hopsUsed: 6 });
  });

  it('rejects hops after the game is finished', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));
    expect(state().hasWon).toBe(true);

    await expect(state().addHop(201, movieFor(201))).resolves.toMatchObject({ ok: false, reason: 'Game already finished' });
  });
});

describe('undoHop', () => {
  it('restores the previous person and hops mid-game', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(201, movieFor(201));

    expect(state().undoHop()).toBe(true);
    expect(state().path).toEqual([puzzleOf(DAILY_DATE).startId]);
    expect(state().hops).toHaveLength(0);
    expect(state().hasWon).toBe(false);
    expect(state().hasLost).toBe(false);
  });

  it('returns false when there is nothing to undo', () => {
    expect(state().undoHop()).toBe(false);
  });

  it('is blocked after a win', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));
    expect(state().hasWon).toBe(true);

    expect(state().undoHop()).toBe(false);
    expect(state().path).toEqual([puzzleOf(DAILY_DATE).startId, puzzleOf(DAILY_DATE).endId]);
  });

  it('is blocked after a loss', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    for (let hop = 1; hop <= state().maxHops; hop += 1) {
      await state().addHop(200 + hop, movieFor(200 + hop));
    }
    expect(state().hasLost).toBe(true);

    expect(state().undoHop()).toBe(false);
    expect(state().path).toHaveLength(state().maxHops + 1);
  });
});

describe('explorer rounds', () => {
  it('counts explorer wins and keeps the counter across rounds', async () => {
    await state().initMode('explorer');
    const targetId = state().targetPerson!.id;
    await state().addHop(targetId, movieFor(targetId));

    expect(state().hasWon).toBe(true);
    expect(state().explorerWins).toBe(1);

    await state().resetCurrentMode();
    expect(state().hasWon).toBe(false);
    expect(state().hasLost).toBe(false);
    expect(state().path).toHaveLength(1);
    expect(state().hops).toHaveLength(0);
    expect(state().explorerWins).toBe(1);
  });

  it('does not count explorer losses', async () => {
    await state().initMode('explorer');
    useGameState.setState({ explorerWins: 0 });
    await state().completeGame(false);

    expect(state().explorerWins).toBe(0);
  });
});

describe('completeGame guards', () => {
  it('does not record duplicate results for the same day', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));

    await state().completeGame(true);

    expect(state().history).toHaveLength(1);
    expect(state().streak).toBe(1);
  });
});

describe('daily completion persistence', () => {
  it('restores a won daily game with its hops after re-initializing', async () => {
    useDate(DAILY_DATE);
    const puzzle = puzzleOf(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzle.endId, movieFor(puzzle.endId));
    expect(state().hasWon).toBe(true);

    await state().initMode('daily');

    expect(state().hasWon).toBe(true);
    expect(state().hasLost).toBe(false);
    expect(state().hops).toHaveLength(1);
    expect(state().hops[0]).toMatchObject({
      fromPersonId: puzzle.startId,
      toPersonId: puzzle.endId,
      sharedMediaTitle: `Movie ${puzzle.endId}`
    });
    expect(state().path).toEqual([puzzle.startId, puzzle.endId]);
    expect(state().streak).toBe(1);

    const stored = JSON.parse(storage().get('cinelink:history')!);
    expect(stored[0].hops).toHaveLength(1);
  });

  it('restores a lost daily game after re-initializing', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    for (let hop = 1; hop <= state().maxHops; hop += 1) {
      await state().addHop(200 + hop, movieFor(200 + hop));
    }
    expect(state().hasLost).toBe(true);

    await state().initMode('daily');

    expect(state().hasLost).toBe(true);
    expect(state().hasWon).toBe(false);
    expect(state().hops).toHaveLength(state().maxHops);
    expect(state().streak).toBe(0);
  });

  it('keeps the finished daily state when resetCurrentMode is called', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));

    await state().resetCurrentMode();

    expect(state().hasWon).toBe(true);
    expect(state().hops).toHaveLength(1);
  });

  it('restores the finished state for legacy entries saved without hops', async () => {
    useDate(DAILY_DATE);
    storage().set(
      'cinelink:history',
      JSON.stringify([
        { date: DAILY_DATE, mode: 'daily', win: true, hopsUsed: 3, completedAt: `${DAILY_DATE}T10:00:00.000Z` }
      ])
    );

    await state().initMode('daily');

    expect(state().hasWon).toBe(true);
    expect(state().hasLost).toBe(false);
    expect(state().hops).toEqual([]);
    expect(state().path).toEqual([puzzleOf(DAILY_DATE).startId]);
  });

  it('starts a fresh board the next day after a completed daily', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));
    expect(state().hasWon).toBe(true);

    useDate(NEXT_DATE);
    await state().initMode('daily');

    expect(state().hasWon).toBe(false);
    expect(state().hasLost).toBe(false);
    expect(state().hops).toHaveLength(0);
    expect(state().path).toEqual([puzzleOf(NEXT_DATE).startId]);
  });
});

describe('multi-day streaks', () => {
  it('grows the streak across consecutive wins and preserves bestStreak after a loss', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));
    expect(state().streak).toBe(1);

    useDate(NEXT_DATE);
    await state().initMode('daily');
    expect(state().streak).toBe(1);
    await state().addHop(puzzleOf(NEXT_DATE).endId, movieFor(puzzleOf(NEXT_DATE).endId));
    expect(state().streak).toBe(2);
    expect(state().bestStreak).toBe(2);

    useDate(LOSS_DATE);
    await state().initMode('daily');
    expect(state().streak).toBe(2);
    for (let hop = 1; hop <= state().maxHops; hop += 1) {
      await state().addHop(300 + hop, movieFor(300 + hop));
    }
    expect(state().hasLost).toBe(true);
    expect(state().streak).toBe(0);
    expect(state().bestStreak).toBe(2);
    expect(state().history).toHaveLength(3);
  });
});

describe('giveUp', () => {
  it('ends an explorer round without counting a win or loss', async () => {
    await state().initMode('explorer');
    useGameState.setState({ explorerWins: 0 });

    expect(state().giveUp()).toBe(true);
    expect(state().hasLost).toBe(true);
    expect(state().explorerWins).toBe(0);
  });

  it('stops the speedrun timer after giving up', async () => {
    await state().initMode('speedrun');
    const startedAt = state().speedRunStartedAt!;
    useGameState.setState({ speedRunStartedAt: startedAt - 65000 });
    state().tickSpeedRun();

    expect(state().giveUp()).toBe(true);
    const frozen = state().speedRunSeconds;
    state().tickSpeedRun();
    expect(state().speedRunSeconds).toBe(frozen);
  });

  it('is a no-op for daily mode', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');

    expect(state().giveUp()).toBe(false);
    expect(state().hasLost).toBe(false);
  });

  it('is a no-op once the game is finished', async () => {
    await state().initMode('explorer');
    useGameState.setState({ hasWon: true });

    expect(state().giveUp()).toBe(false);
  });
});

describe('shareResult', () => {
  it('formats a won daily result with the hop count', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    await state().addHop(puzzleOf(DAILY_DATE).endId, movieFor(puzzleOf(DAILY_DATE).endId));

    expect(state().shareResult()).toBe(`CineLink Daily ${DAILY_DATE}\n🎬→✅\nHops: 1/6`);
  });

  it('formats a lost daily result', async () => {
    useDate(DAILY_DATE);
    await state().initMode('daily');
    for (let hop = 1; hop <= state().maxHops; hop += 1) {
      await state().addHop(200 + hop, movieFor(200 + hop));
    }

    expect(state().shareResult()).toBe(`CineLink Daily ${DAILY_DATE}\n🎬→🎬→🎬→🎬→🎬→🎬→❌\nHops: 6/6`);
  });

  it('formats explorer results without a hop limit once the target is reached', async () => {
    await state().initMode('explorer');
    const startId = state().path[0];
    const targetId = state().targetPerson!.id;
    const [hopA] = (pool as { id: number }[]).map((p) => p.id).filter((id) => id !== startId && id !== targetId);

    await state().addHop(hopA, movieFor(hopA));
    expect(state().shareResult()).toBe('CineLink Explorer\n🎬→❌\nHops: 1');

    await state().addHop(targetId, movieFor(targetId));
    expect(state().hasWon).toBe(true);
    expect(state().shareResult()).toBe('CineLink Explorer\n🎬→🎬→✅\nHops: 2');
  });
});
