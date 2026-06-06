import { getPersonCredits } from '../api/tmdb';
import type { MovieLite, PersonId } from '../types/game';

const movieSort = (a: MovieLite, b: MovieLite) => {
  const aDate = a.release_date ? Date.parse(a.release_date) : 0;
  const bDate = b.release_date ? Date.parse(b.release_date) : 0;
  return bDate - aDate;
};

const normalizePersonMovieIds = async (personId: PersonId) => {
  const credits = await getPersonCredits(personId);
  const byId = new Map<number, MovieLite>();

  for (const movie of credits.cast) {
    byId.set(movie.id, {
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      poster_path: movie.poster_path ?? null
    });
  }

  for (const movie of credits.crew) {
    if (!byId.has(movie.id)) {
      byId.set(movie.id, {
        id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        poster_path: movie.poster_path ?? null
      });
    }
  }

  return byId;
};

export const getSharedMovies = async (personIdA: PersonId, personIdB: PersonId): Promise<MovieLite[]> => {
  if (personIdA === personIdB) {
    return [];
  }
  const [aMovies, bMovies] = await Promise.all([normalizePersonMovieIds(personIdA), normalizePersonMovieIds(personIdB)]);
  const shared: MovieLite[] = [];
  for (const [movieId, movie] of aMovies.entries()) {
    if (bMovies.has(movieId)) {
      shared.push(movie);
    }
  }
  return shared.sort(movieSort);
};

export const isValidHop = async (personIdA: PersonId, personIdB: PersonId): Promise<boolean> => {
  const shared = await getSharedMovies(personIdA, personIdB);
  return shared.length > 0;
};

export const buildPath = async (hops: PersonId[]) => {
  if (hops.length < 2) {
    return { valid: true, invalidIndex: null as number | null, sharedMoviesByHop: [] as MovieLite[][] };
  }

  const sharedMoviesByHop: MovieLite[][] = [];
  for (let i = 0; i < hops.length - 1; i += 1) {
    const shared = await getSharedMovies(hops[i], hops[i + 1]);
    if (shared.length === 0) {
      return { valid: false, invalidIndex: i + 1, sharedMoviesByHop };
    }
    sharedMoviesByHop.push(shared);
  }

  return { valid: true, invalidIndex: null as number | null, sharedMoviesByHop };
};
