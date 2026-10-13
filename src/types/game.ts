export type PersonId = number;

export type MediaType = 'movie' | 'tv';

export type GameMode = 'daily' | 'explorer' | 'speedrun';

export type PuzzleEntry = {
  date: string;
  startId: PersonId;
  startName: string;
  endId: PersonId;
  endName: string;
  shortestPath?: PersonId[];
};

export type Hop = {
  fromPersonId: PersonId;
  toPersonId: PersonId;
  sharedMediaType: MediaType;
  sharedMediaId: number;
  sharedMediaTitle: string;
};

export type PuzzleHistoryEntry = {
  date: string;
  mode: GameMode;
  win: boolean;
  hopsUsed: number;
  completedAt: string;
};

export type PersonLite = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
};

export type MovieLite = {
  id: number;
  title: string;
  mediaType: MediaType;
  release_date?: string;
  poster_path?: string | null;
};
