import { fireEvent, render, screen } from '@testing-library/react-native';
import puzzles from '../data/puzzles.json';
import pool from '../data/tmdbPool.json';
import { getMovieCredits, getPersonCredits, getPersonDetails, isTmdbConfigured } from '../api/tmdb';
import { GameScreen } from '../screens/GameScreen';
import { useGameState } from '../game/gameState';
import { useIsWideScreen } from '../hooks/useIsWideScreen';
import type { PuzzleEntry } from '../types/game';

jest.mock('../api/tmdb', () => ({
  getImageUrl: jest.fn(() => null),
  getPersonDetails: jest.fn(),
  getPersonCredits: jest.fn(),
  getMovieCredits: jest.fn(),
  isTmdbConfigured: jest.fn(() => true)
}));

jest.mock('../hooks/useIsWideScreen', () => ({
  useIsWideScreen: jest.fn()
}));

const mockedGetPersonDetails = getPersonDetails as jest.MockedFunction<typeof getPersonDetails>;
const mockedGetPersonCredits = getPersonCredits as jest.MockedFunction<typeof getPersonCredits>;
const mockedGetMovieCredits = getMovieCredits as jest.MockedFunction<typeof getMovieCredits>;
const mockedUseIsWideScreen = useIsWideScreen as jest.Mock;
const mockedIsTmdbConfigured = isTmdbConfigured as jest.Mock;

const DAILY_DATE = '2026-05-05';
const FIXED_NOW = new Date(`${DAILY_DATE}T12:00:00Z`).getTime();

const puzzleOf = (date: string) => (puzzles as PuzzleEntry[]).find((p) => p.date === date)!;

let creditsFor: Record<
  number,
  { cast: { id: number; title: string; release_date?: string; popularity?: number }[]; crew: { id: number; title: string; job: string; department: string }[] }
>;
let movieCreditsFor: Record<
  number,
  { cast: { id: number; name: string; profile_path: string | null }[]; crew: { id: number; name: string; job: string; department: string; profile_path: string | null }[] }
>;

beforeEach(() => {
  jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(`${DAILY_DATE}T12:00:00.000Z`);
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  mockedUseIsWideScreen.mockReturnValue(false);
  mockedIsTmdbConfigured.mockReturnValue(true);
  creditsFor = {};
  movieCreditsFor = {};
  mockedGetPersonDetails.mockImplementation(async (id: number) => {
    const puzzle = (puzzles as PuzzleEntry[]).find((p) => p.startId === id || p.endId === id);
    return {
      id,
      name: puzzle && puzzle.startId === id ? puzzle.startName : puzzle && puzzle.endId === id ? puzzle.endName : `Person ${id}`,
      biography: '',
      birthday: null,
      known_for_department: 'Acting',
      place_of_birth: null,
      profile_path: null,
      popularity: 1
    };
  });
  mockedGetPersonCredits.mockImplementation(async (personId: number) => {
    const credits = creditsFor[personId] ?? { cast: [], crew: [] };
    return { id: personId, cast: credits.cast, crew: credits.crew };
  });
  mockedGetMovieCredits.mockImplementation(async (movieId: number) => {
    const credits = movieCreditsFor[movieId] ?? { cast: [], crew: [] };
    return { id: movieId, cast: credits.cast, crew: credits.crew };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders start and target cards with the movie browser once initialized', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText(puzzle.endName)).toBeOnTheScreen();
  expect(screen.getByText('Start')).toBeOnTheScreen();
  expect(screen.getByText('Target')).toBeOnTheScreen();
  expect(screen.getByText('Current Path')).toBeOnTheScreen();
  expect(screen.getByText('Select a movie to see its cast and directors')).toBeOnTheScreen();
  expect((await screen.findAllByText(puzzle.startName)).length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText('TARGET')).toBeNull();
});

it('browses movies, picks one, and hops to a person from its credits', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = {
    cast: [
      { id: 101, title: 'Birds of Prey', release_date: '2020-02-07' },
      { id: 102, title: 'Suicide Squad', release_date: '2016-08-05' }
    ],
    crew: []
  };
  movieCreditsFor[101] = {
    cast: [{ id: 201, name: 'Ewan McGregor', profile_path: null }],
    crew: [{ id: 301, name: 'Cathy Yan', job: 'Director', department: 'Directing', profile_path: null }]
  };
  render(<GameScreen mode="daily" />);

  fireEvent.press(await screen.findByText('Birds of Prey'));

  expect(await screen.findByText('Select a person to continue the chain')).toBeOnTheScreen();
  expect(screen.getByText('Directors')).toBeOnTheScreen();
  expect(screen.getByText('Cathy Yan')).toBeOnTheScreen();
  expect(screen.getByText('Cast')).toBeOnTheScreen();
  expect(screen.getByText('Ewan McGregor')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Ewan McGregor'));

  expect(await screen.findByText('Hops: 1/6')).toBeOnTheScreen();
  expect(screen.getByText('↩ Undo')).toBeOnTheScreen();
  expect(screen.getByText('Birds of Prey')).toBeOnTheScreen();
});

it('wins when selecting the target person from the credits', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Suicide Squad', release_date: '2016-08-05' }], crew: [] };
  movieCreditsFor[101] = { cast: [{ id: puzzle.endId, name: puzzle.endName, profile_path: null }], crew: [] };
  render(<GameScreen mode="daily" />);

  fireEvent.press(await screen.findByText('Suicide Squad'));

  expect(await screen.findByText('TARGET')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('TARGET'));

  expect(await screen.findByText('You won')).toBeOnTheScreen();
  expect(screen.getByText('Completed in 1 hops')).toBeOnTheScreen();
});

it('reverts the last hop when pressing Undo', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Focus', release_date: '2015-02-27' }], crew: [] };
  movieCreditsFor[101] = { cast: [{ id: 201, name: 'Person 201', profile_path: null }], crew: [] };
  creditsFor[201] = { cast: [{ id: 102, title: 'Neighborhood Watch', release_date: '2012-01-01' }], crew: [] };
  render(<GameScreen mode="daily" />);

  fireEvent.press(await screen.findByText('Focus'));
  fireEvent.press(await screen.findByText('Person 201'));
  expect(await screen.findByText('Hops: 1/6')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('↩ Undo'));

  expect(await screen.findByText('Hops: 0/6')).toBeOnTheScreen();
  expect(screen.queryByText('↩ Undo')).toBeNull();
  expect(await screen.findByText('Focus')).toBeOnTheScreen();
});

it('expands the cast list beyond the preview limit', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'The Big Picture', release_date: '2021-01-01' }], crew: [] };
  movieCreditsFor[101] = {
    cast: Array.from({ length: 20 }, (_, idx) => ({ id: 400 + idx, name: `Cast Member ${idx}`, profile_path: null })),
    crew: []
  };
  render(<GameScreen mode="daily" />);

  fireEvent.press(await screen.findByText('The Big Picture'));

  expect(await screen.findByText('Cast Member 0')).toBeOnTheScreen();
  expect(screen.queryByText('Cast Member 15')).toBeNull();

  fireEvent.press(screen.getByText('Show all cast (20)'));

  expect(await screen.findByText('Cast Member 15')).toBeOnTheScreen();
  expect(screen.getByText('Cast Member 19')).toBeOnTheScreen();
  expect(screen.getByText('Show less')).toBeOnTheScreen();
});

it("shows a retry when the current person's movies fail to load", async () => {
  mockedGetPersonCredits.mockRejectedValueOnce(new Error('network down'));
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText("Could not load this person's movies.")).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Retry'));

  expect(await screen.findByText('No movies found. Use Undo to go back.')).toBeOnTheScreen();
});

it('reveals target hints progressively and hides the button when none are left', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Focus', release_date: '2015-02-27' }], crew: [] };
  creditsFor[puzzle.endId] = {
    cast: [
      { id: 501, title: 'Justice League', release_date: '2017-11-17', popularity: 60 },
      { id: 502, title: 'Man of Steel', release_date: '2013-06-14', popularity: 50 }
    ],
    crew: []
  };
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText('Need a hint? Movies the target is known for:')).toBeOnTheScreen();
  expect(screen.queryByText('💡 Hint 1: Justice League')).toBeNull();

  fireEvent.press(screen.getByText('💡 Reveal hint (0/3)'));
  expect(await screen.findByText('💡 Hint 1: Justice League')).toBeOnTheScreen();
  expect(screen.queryByText('💡 Hint 2: Man of Steel')).toBeNull();

  fireEvent.press(screen.getByText('💡 Reveal hint (1/3)'));
  expect(await screen.findByText('💡 Hint 2: Man of Steel')).toBeOnTheScreen();
  expect(screen.queryByText('💡 Reveal hint (2/3)')).toBeNull();
});

it('reveals all target hints automatically when the game ends', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Suicide Squad', release_date: '2016-08-05' }], crew: [] };
  movieCreditsFor[101] = { cast: [{ id: puzzle.endId, name: puzzle.endName, profile_path: null }], crew: [] };
  creditsFor[puzzle.endId] = {
    cast: [{ id: 501, title: 'Justice League', release_date: '2017-11-17', popularity: 60 }],
    crew: []
  };
  render(<GameScreen mode="daily" />);

  fireEvent.press(await screen.findByText('Suicide Squad'));
  await screen.findByText('TARGET');
  fireEvent.press(screen.getByText('TARGET'));

  expect(await screen.findByText('You won')).toBeOnTheScreen();
  expect(screen.getByText('💡 Hint 1: Justice League')).toBeOnTheScreen();
  expect(screen.queryByText(/💡 Reveal hint \(/)).toBeNull();
});

it('renders the two-column desktop layout with a vertical timeline', async () => {
  mockedUseIsWideScreen.mockReturnValue(true);
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Focus', release_date: '2015-02-27' }], crew: [] };
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText('Focus')).toBeOnTheScreen();
  expect(screen.getByText('Current Path')).toBeOnTheScreen();
  expect(screen.getByText('Hops: 0/6')).toBeOnTheScreen();
  expect(screen.getByText('?')).toBeOnTheScreen();
  expect((await screen.findAllByText(puzzle.endName)).length).toBeGreaterThanOrEqual(2);
});

it('starts the next explorer round from the win card', async () => {
  for (const person of pool as { id: number }[]) {
    creditsFor[person.id] = { cast: [{ id: 101, title: 'Round Movie', release_date: '2015-01-01' }], crew: [] };
  }
  render(<GameScreen mode="explorer" />);

  await screen.findByText('Round Movie');
  const { targetPerson } = useGameState.getState();
  movieCreditsFor[101] = { cast: [{ id: targetPerson!.id, name: targetPerson!.name, profile_path: null }], crew: [] };

  fireEvent.press(screen.getByText('Round Movie'));
  fireEvent.press(await screen.findByText('TARGET'));

  expect(await screen.findByText('You won')).toBeOnTheScreen();
  expect(useGameState.getState().explorerWins).toBe(1);
  expect(screen.getByText('Rounds won: 1')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Next round →'));

  expect(await screen.findByText('Select a movie to see its cast and directors')).toBeOnTheScreen();
  expect(useGameState.getState().hasWon).toBe(false);
  expect(useGameState.getState().explorerWins).toBe(1);
});

it('renders the speedrun timer HUD', async () => {
  render(<GameScreen mode="speedrun" />);

  expect(await screen.findByText('Time: 00:00')).toBeOnTheScreen();
});

it('shows an empty state when today has no puzzle', async () => {
  jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2027-01-01T12:00:00.000Z');
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText('No puzzle available today')).toBeOnTheScreen();
  expect(screen.queryByText('Current Path')).toBeNull();
});

it('shows an error card with retry when initialization fails', async () => {
  const originalInitMode = useGameState.getState().initMode;
  useGameState.setState({ initMode: () => Promise.reject(new Error('boom')) });
  try {
    render(<GameScreen mode="daily" />);

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Retry')).toBeOnTheScreen();
  } finally {
    useGameState.setState({ initMode: originalInitMode });
  }
});

it('shows a configuration notice when TMDB is not configured', async () => {
  mockedIsTmdbConfigured.mockReturnValue(false);
  render(<GameScreen mode="daily" />);

  expect(await screen.findByText('TMDB not configured')).toBeOnTheScreen();
  expect(screen.queryByText('Current Path')).toBeNull();
});

const stubBrowserCredits = () => {
  for (const person of pool as { id: number }[]) {
    creditsFor[person.id] = { cast: [{ id: 101, title: 'Round Movie', release_date: '2015-01-01' }], crew: [] };
  }
};

it('lets the player give up in explorer and start a new pair', async () => {
  stubBrowserCredits();
  render(<GameScreen mode="explorer" />);

  await screen.findByText('Round Movie');
  fireEvent.press(screen.getByText('Give up'));
  fireEvent.press(screen.getByText('Yes'));

  expect(await screen.findByText('Round skipped')).toBeOnTheScreen();
  expect(useGameState.getState().hasLost).toBe(true);

  fireEvent.press(screen.getByText('New pair →'));

  expect(await screen.findByText('Select a movie to see its cast and directors')).toBeOnTheScreen();
  expect(useGameState.getState().hasLost).toBe(false);
  expect(useGameState.getState().path).toHaveLength(1);
});

it('lets the player give up in speed run and try again', async () => {
  stubBrowserCredits();
  render(<GameScreen mode="speedrun" />);

  await screen.findByText('Round Movie');
  fireEvent.press(screen.getByText('Give up'));
  fireEvent.press(screen.getByText('Yes'));

  expect(await screen.findByText('Run ended')).toBeOnTheScreen();
  expect(screen.getByText('Try again')).toBeOnTheScreen();
});

it('does not offer give up in daily mode', async () => {
  const puzzle = puzzleOf(DAILY_DATE);
  creditsFor[puzzle.startId] = { cast: [{ id: 101, title: 'Round Movie', release_date: '2015-01-01' }], crew: [] };
  render(<GameScreen mode="daily" />);

  await screen.findByText('Round Movie');
  expect(screen.queryByText('Give up')).toBeNull();
});
