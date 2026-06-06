export type PersonId = number;

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
  sharedMovieId: number;
  sharedMovieTitle: string;
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
  release_date?: string;
  poster_path?: string | null;
};
