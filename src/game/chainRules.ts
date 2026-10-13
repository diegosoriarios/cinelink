import type { PersonId } from '../types/game';

export const findSharedMediaKeys = (mediaA: Iterable<string>, mediaB: Iterable<string>): Set<string> => {
  const setB = mediaB instanceof Set ? mediaB : new Set(mediaB);
  const shared = new Set<string>();
  for (const key of mediaA) {
    if (setB.has(key)) {
      shared.add(key);
    }
  }
  return shared;
};

export type ChainValidation = {
  valid: boolean;
  invalidIndex: number | null;
};

export const MIN_CHAIN_LENGTH = 2;

export const validateChain = (creditsByPerson: Map<PersonId, Set<string>>, path: PersonId[]): ChainValidation => {
  if (path.length < MIN_CHAIN_LENGTH) {
    return { valid: false, invalidIndex: 0 };
  }
  for (let i = 0; i < path.length - 1; i += 1) {
    const mediaA = creditsByPerson.get(path[i]);
    const mediaB = creditsByPerson.get(path[i + 1]);
    if (!mediaA || !mediaB || findSharedMediaKeys(mediaA, mediaB).size === 0) {
      return { valid: false, invalidIndex: i + 1 };
    }
  }
  return { valid: true, invalidIndex: null };
};
