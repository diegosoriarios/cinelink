import { findSharedMovieIds, validateChain } from './chainRules';

const credits = (entries: [number, number[]][]) => new Map(entries.map(([personId, movies]) => [personId, new Set(movies)]));

describe('findSharedMovieIds', () => {
  it('returns the intersection of two movie sets', () => {
    const shared = findSharedMovieIds(new Set([1, 2, 3]), new Set([2, 3, 4]));
    expect([...shared].sort()).toEqual([2, 3]);
  });

  it('returns an empty set when there is no overlap', () => {
    expect(findSharedMovieIds(new Set([1]), new Set([2])).size).toBe(0);
  });

  it('accepts plain iterables for the first argument', () => {
    expect(findSharedMovieIds([1, 2], new Set([2, 3])).size).toBe(1);
  });
});

describe('validateChain', () => {
  it('accepts a chain where every consecutive pair shares a movie', () => {
    const result = validateChain(credits([
      [1, [10, 11]],
      [2, [11, 12]],
      [3, [12, 13]]
    ]), [1, 2, 3]);

    expect(result).toEqual({ valid: true, invalidIndex: null });
  });

  it('rejects a pair with no shared movie and reports its index', () => {
    const result = validateChain(credits([
      [1, [10]],
      [2, [99]],
      [3, [99]]
    ]), [1, 2, 3]);

    expect(result).toEqual({ valid: false, invalidIndex: 1 });
  });

  it('rejects chains shorter than two people', () => {
    expect(validateChain(credits([[1, [10]]]), [1])).toEqual({ valid: false, invalidIndex: 0 });
    expect(validateChain(credits([[1, [10]]]), [])).toEqual({ valid: false, invalidIndex: 0 });
  });

  it('rejects when a person has no credits fetched', () => {
    const result = validateChain(credits([[1, [10]]]), [1, 2]);

    expect(result).toEqual({ valid: false, invalidIndex: 1 });
  });
});
