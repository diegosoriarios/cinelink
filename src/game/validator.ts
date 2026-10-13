import { getPersonCredits } from '../api/tmdb';
import { mediaKey } from './media';
import type { MovieLite, PersonId } from '../types/game';

const titleSort = (a: MovieLite, b: MovieLite) => {
  const aDate = a.release_date ? Date.parse(a.release_date) : 0;
  const bDate = b.release_date ? Date.parse(b.release_date) : 0;
  return bDate - aDate;
};

const normalizePersonTitles = async (personId: PersonId) => {
  const credits = await getPersonCredits(personId);
  const byKey = new Map<string, MovieLite>();

  const add = (credit: { id: number; title: string; media_type: MovieLite['mediaType']; release_date?: string; poster_path?: string | null }) => {
    const key = mediaKey(credit.media_type, credit.id);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: credit.id,
        title: credit.title,
        mediaType: credit.media_type,
        release_date: credit.release_date,
        poster_path: credit.poster_path ?? null
      });
    }
  };

  credits.cast.forEach(add);
  credits.crew.forEach(add);

  return byKey;
};

export const getSharedMovies = async (personIdA: PersonId, personIdB: PersonId): Promise<MovieLite[]> => {
  if (personIdA === personIdB) {
    return [];
  }
  const [aTitles, bTitles] = await Promise.all([normalizePersonTitles(personIdA), normalizePersonTitles(personIdB)]);
  const shared: MovieLite[] = [];
  for (const [key, title] of aTitles.entries()) {
    if (bTitles.has(key)) {
      shared.push(title);
    }
  }
  return shared.sort(titleSort);
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
