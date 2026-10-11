import type { PersonCreditsResponse } from '../api/tmdb';

export type HintMovie = { id: number; title: string };

export const HINT_COUNT = 3;

type Candidate = HintMovie & { popularity: number; releaseTime: number };

export const pickHintMovies = (credits: PersonCreditsResponse): HintMovie[] => {
  const seen = new Set<number>();
  const candidates: Candidate[] = [];
  const push = (movie: { id: number; title: string; release_date?: string; popularity?: number }) => {
    if (!movie?.id || !movie.title || seen.has(movie.id)) {
      return;
    }
    seen.add(movie.id);
    candidates.push({
      id: movie.id,
      title: movie.title,
      popularity: movie.popularity ?? 0,
      releaseTime: movie.release_date ? Date.parse(movie.release_date) : 0
    });
  };
  credits.cast.forEach(push);
  credits.crew.forEach(push);
  return candidates
    .sort((a, b) => b.popularity - a.popularity || b.releaseTime - a.releaseTime)
    .slice(0, HINT_COUNT)
    .map(({ id, title }) => ({ id, title }));
};
