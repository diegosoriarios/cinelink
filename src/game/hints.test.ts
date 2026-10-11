import { HINT_COUNT, pickHintMovies } from './hints';
import type { PersonCreditsResponse } from '../api/tmdb';

const creditsOf = (
  cast: PersonCreditsResponse['cast'] = [],
  crew: PersonCreditsResponse['crew'] = []
): PersonCreditsResponse => ({ id: 1, cast, crew });

describe('pickHintMovies', () => {
  it('orders movies by popularity, most famous first', () => {
    const result = pickHintMovies(
      creditsOf([
        { id: 1, title: 'Low Pop', popularity: 1, release_date: '2020-01-01' },
        { id: 2, title: 'Blockbuster', popularity: 90 },
        { id: 3, title: 'Mid', popularity: 40 }
      ])
    );

    expect(result).toEqual([
      { id: 2, title: 'Blockbuster' },
      { id: 3, title: 'Mid' },
      { id: 1, title: 'Low Pop' }
    ]);
  });

  it('dedupes movies that appear in both cast and crew', () => {
    const result = pickHintMovies(
      creditsOf([{ id: 1, title: 'Dual Credit', popularity: 10 }], [
        { id: 1, title: 'Dual Credit', popularity: 99, job: 'Director', department: 'Directing' }
      ])
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1, title: 'Dual Credit' });
  });

  it('caps the list at three hints', () => {
    const cast = Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1, title: `Movie ${idx}`, popularity: idx }));
    const result = pickHintMovies(creditsOf(cast));

    expect(result).toHaveLength(HINT_COUNT);
    expect(result.map((movie) => movie.title)).toEqual(['Movie 5', 'Movie 4', 'Movie 3']);
  });

  it('breaks popularity ties with the newest release', () => {
    const result = pickHintMovies(
      creditsOf([
        { id: 1, title: 'Old', release_date: '1990-01-01' },
        { id: 2, title: 'New', release_date: '2024-05-01' }
      ])
    );

    expect(result.map((movie) => movie.title)).toEqual(['New', 'Old']);
  });

  it('returns an empty list when there are no credits', () => {
    expect(pickHintMovies(creditsOf())).toEqual([]);
  });
});
