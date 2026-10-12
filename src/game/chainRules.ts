import type { PersonId } from '../types/game';

export const findSharedMovieIds = (moviesA: Iterable<number>, moviesB: Iterable<number>): Set<number> => {
  const setB = moviesB instanceof Set ? moviesB : new Set(moviesB);
  const shared = new Set<number>();
  for (const movieId of moviesA) {
    if (setB.has(movieId)) {
      shared.add(movieId);
    }
  }
  return shared;
};

export type ChainValidation = {
  valid: boolean;
  invalidIndex: number | null;
};

export const MIN_CHAIN_LENGTH = 2;

export const validateChain = (creditsByPerson: Map<PersonId, Set<number>>, path: PersonId[]): ChainValidation => {
  if (path.length < MIN_CHAIN_LENGTH) {
    return { valid: false, invalidIndex: 0 };
  }
  for (let i = 0; i < path.length - 1; i += 1) {
    const moviesA = creditsByPerson.get(path[i]);
    const moviesB = creditsByPerson.get(path[i + 1]);
    if (!moviesA || !moviesB || findSharedMovieIds(moviesA, moviesB).size === 0) {
      return { valid: false, invalidIndex: i + 1 };
    }
  }
  return { valid: true, invalidIndex: null };
};
