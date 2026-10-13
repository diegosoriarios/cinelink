import { findSharedMediaKeys, validateChain } from './chainRules';

const credits = (entries: [number, string[]][]) => new Map(entries.map(([personId, keys]) => [personId, new Set(keys)]));

describe('findSharedMediaKeys', () => {
  it('returns the intersection of two media sets', () => {
    const shared = findSharedMediaKeys(new Set(['movie:1', 'movie:2']), new Set(['movie:2', 'tv:2']));
    expect([...shared].sort()).toEqual(['movie:2']);
  });

  it('returns an empty set when there is no overlap', () => {
    expect(findSharedMediaKeys(new Set(['movie:1']), new Set(['movie:2'])).size).toBe(0);
  });

  it('treats the same id in different media namespaces as distinct', () => {
    expect(findSharedMediaKeys(new Set(['movie:1']), new Set(['tv:1'])).size).toBe(0);
  });

  it('accepts plain iterables for the first argument', () => {
    expect(findSharedMediaKeys(['movie:1', 'movie:2'], new Set(['movie:2', 'tv:3'])).size).toBe(1);
  });
});

describe('validateChain', () => {
  it('accepts a chain where every consecutive pair shares a title', () => {
    const result = validateChain(credits([
      [1, ['movie:10', 'movie:11']],
      [2, ['movie:11', 'movie:12']],
      [3, ['movie:12', 'movie:13']]
    ]), [1, 2, 3]);

    expect(result).toEqual({ valid: true, invalidIndex: null });
  });

  it('rejects a pair with no shared title and reports its index', () => {
    const result = validateChain(credits([
      [1, ['movie:10']],
      [2, ['movie:99']],
      [3, ['movie:99']]
    ]), [1, 2, 3]);

    expect(result).toEqual({ valid: false, invalidIndex: 1 });
  });

  it('rejects chains shorter than two people', () => {
    expect(validateChain(credits([[1, ['movie:10']]]), [1])).toEqual({ valid: false, invalidIndex: 0 });
    expect(validateChain(credits([[1, ['movie:10']]]), [])).toEqual({ valid: false, invalidIndex: 0 });
  });

  it('rejects when a person has no credits fetched', () => {
    const result = validateChain(credits([[1, ['movie:10']]]), [1, 2]);

    expect(result).toEqual({ valid: false, invalidIndex: 1 });
  });
});
