import { mediaKey } from './media';
import type { PersonCreditsResponse } from '../api/tmdb';
import type { MediaType } from '../types/game';

export type HintMovie = { id: number; title: string; mediaType: MediaType };

export const HINT_COUNT = 3;

type Candidate = HintMovie & { popularity: number; releaseTime: number };

export const pickHintMovies = (credits: PersonCreditsResponse): HintMovie[] => {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const push = (credit: { id: number; title: string; media_type?: MediaType; release_date?: string; popularity?: number }) => {
    if (!credit?.id || !credit.title) {
      return;
    }
    const mediaType = credit.media_type ?? 'movie';
    const key = mediaKey(mediaType, credit.id);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      id: credit.id,
      title: credit.title,
      mediaType,
      popularity: credit.popularity ?? 0,
      releaseTime: credit.release_date ? Date.parse(credit.release_date) : 0
    });
  };
  credits.cast.forEach(push);
  credits.crew.forEach(push);
  return candidates
    .sort((a, b) => b.popularity - a.popularity || b.releaseTime - a.releaseTime)
    .slice(0, HINT_COUNT)
    .map(({ id, title, mediaType }) => ({ id, title, mediaType }));
};
