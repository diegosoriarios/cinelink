import { getPersonCredits } from '../api/tmdb';
import { buildPath, getSharedMovies, isValidHop } from './validator';

jest.mock('../api/tmdb', () => ({
  getPersonCredits: jest.fn()
}));

const mockedGetPersonCredits = getPersonCredits as jest.MockedFunction<typeof getPersonCredits>;

const creditEntry = (id: number, title: string, release_date?: string) => ({ id, title, release_date });

const creditsByPerson: Record<number, { cast: ReturnType<typeof creditEntry>[]; crew: ReturnType<typeof creditEntry>[] }> = {
  1: {
    cast: [creditEntry(101, 'Old Movie', '2000-01-01'), creditEntry(102, 'New Movie', '2020-05-01')],
    crew: []
  },
  2: {
    cast: [creditEntry(103, 'Other Movie', '2010-03-10')],
    crew: [creditEntry(102, 'New Movie', '2020-05-01')]
  },
  3: {
    cast: [creditEntry(103, 'Other Movie', '2010-03-10')],
    crew: []
  },
  4: {
    cast: [creditEntry(101, 'Old Movie', '2000-01-01'), creditEntry(102, 'New Movie', '2020-05-01')],
    crew: [creditEntry(101, 'Old Movie', '2000-01-01')]
  }
};

beforeEach(() => {
  mockedGetPersonCredits.mockImplementation(async (personId) => {
    const credits = creditsByPerson[personId];
    if (!credits) {
      throw new Error(`No credits for ${personId}`);
    }
    return { id: personId, cast: credits.cast, crew: credits.crew } as never;
  });
});

describe('getSharedMovies', () => {
  it('returns empty list when both ids are identical', async () => {
    await expect(getSharedMovies(1, 1)).resolves.toEqual([]);
    expect(mockedGetPersonCredits).not.toHaveBeenCalled();
  });

  it('returns intersection of cast and crew credits sorted newest first', async () => {
    const shared = await getSharedMovies(1, 4);
    expect(shared.map((m) => m.id)).toEqual([102, 101]);
  });

  it('finds movies shared via crew credits', async () => {
    const shared = await getSharedMovies(1, 2);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ id: 102, title: 'New Movie' });
  });

  it('returns empty list when no shared movie exists', async () => {
    await expect(getSharedMovies(1, 3)).resolves.toEqual([]);
  });
});

describe('isValidHop', () => {
  it('is true when a shared movie exists', async () => {
    await expect(isValidHop(1, 2)).resolves.toBe(true);
  });

  it('is false when there is no shared movie', async () => {
    await expect(isValidHop(1, 3)).resolves.toBe(false);
  });
});

describe('buildPath', () => {
  it('treats paths with fewer than 2 people as valid with no hops', async () => {
    await expect(buildPath([])).resolves.toEqual({ valid: true, invalidIndex: null, sharedMoviesByHop: [] });
    await expect(buildPath([1])).resolves.toEqual({ valid: true, invalidIndex: null, sharedMoviesByHop: [] });
  });

  it('validates a full connected path and returns shared movies per hop', async () => {
    const result = await buildPath([1, 2, 3]);
    expect(result.valid).toBe(true);
    expect(result.invalidIndex).toBeNull();
    expect(result.sharedMoviesByHop).toHaveLength(2);
    expect(result.sharedMoviesByHop[0][0].id).toBe(102);
    expect(result.sharedMoviesByHop[1][0].id).toBe(103);
  });

  it('reports the invalid hop index for a broken path', async () => {
    const result = await buildPath([1, 3, 2]);
    expect(result.valid).toBe(false);
    expect(result.invalidIndex).toBe(1);
    expect(result.sharedMoviesByHop).toHaveLength(0);
  });
});
