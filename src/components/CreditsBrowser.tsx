import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  getImageUrl,
  getMovieCredits,
  getPersonCredits,
  type MovieCreditsResponse,
  type PersonCreditsResponse
} from '../api/tmdb';
import type { MovieLite, PersonId, PersonLite } from '../types/game';

const CAST_PREVIEW_COUNT = 15;

const releaseTime = (movie: MovieLite) => (movie.release_date ? Date.parse(movie.release_date) : 0);

const byReleaseDesc = (a: MovieLite, b: MovieLite) => releaseTime(b) - releaseTime(a);

const normalizeMovies = (credits: PersonCreditsResponse): MovieLite[] => {
  const seen = new Set<number>();
  const movies: MovieLite[] = [];
  const push = (movie: { id: number; title: string; release_date?: string; poster_path?: string | null }) => {
    if (!movie?.id || !movie.title || seen.has(movie.id)) {
      return;
    }
    seen.add(movie.id);
    movies.push({ id: movie.id, title: movie.title, release_date: movie.release_date, poster_path: movie.poster_path ?? null });
  };
  credits.cast.forEach(push);
  credits.crew.forEach(push);
  return movies.sort(byReleaseDesc);
};

const normalizeDirectors = (credits: MovieCreditsResponse): PersonLite[] => {
  const seen = new Set<number>();
  const directors: PersonLite[] = [];
  for (const member of credits.crew) {
    if (member.department !== 'Directing' || member.job !== 'Director' || seen.has(member.id)) {
      continue;
    }
    seen.add(member.id);
    directors.push({ id: member.id, name: member.name, profile_path: member.profile_path });
  }
  return directors;
};

const normalizeCast = (credits: MovieCreditsResponse): PersonLite[] =>
  credits.cast.map((member) => ({ id: member.id, name: member.name, profile_path: member.profile_path }));

export const Avatar = ({ path, size }: { path: string | null; size: number }) => {
  const uri = getImageUrl(path);
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1e293b' }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#334155' }} />
  );
};

const PersonRow = ({ person, isTarget, onPress }: { person: PersonLite; isTarget: boolean; onPress: (person: PersonLite) => void }) => {
  return (
    <Pressable style={[styles.personRow, isTarget ? styles.personRowTarget : null]} onPress={() => onPress(person)}>
      <Avatar path={person.profile_path} size={36} />
      <Text style={styles.personRowName} numberOfLines={1}>{person.name}</Text>
      {isTarget ? (
        <View style={styles.targetBadge}>
          <Text style={styles.targetBadgeText}>TARGET</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const Poster = ({ path, width }: { path: string | null; width: number }) => {
  const uri = getImageUrl(path);
  const height = Math.round(width * 1.5);
  return uri ? (
    <Image source={{ uri }} style={{ width, height, borderRadius: 6, backgroundColor: '#1e293b' }} />
  ) : (
    <View style={{ width, height, borderRadius: 6, backgroundColor: '#334155' }} />
  );
};

const MovieRow = ({ movie, onPress }: { movie: MovieLite; onPress: () => void }) => {
  return (
    <Pressable style={styles.movieRow} onPress={onPress}>
      <Poster path={movie.poster_path ?? null} width={40} />
      <View style={styles.movieRowText}>
        <Text style={styles.movieRowTitle} numberOfLines={1}>{movie.title}</Text>
        {movie.release_date ? <Text style={styles.movieRowYear}>{movie.release_date.slice(0, 4)}</Text> : null}
      </View>
    </Pressable>
  );
};

type PersonCreditsState = { personId: PersonId; movies: MovieLite[]; error: boolean };
type MovieCreditsState = { movieId: number; directors: PersonLite[]; cast: PersonLite[]; error: boolean };

type Props = {
  personId: PersonId;
  personName: string;
  targetPersonId: PersonId | null;
  onHop: (person: PersonLite, movie: MovieLite) => boolean | Promise<boolean>;
  style?: StyleProp<ViewStyle>;
};

export const CreditsBrowser = ({ personId, personName, targetPersonId, onHop, style }: Props) => {
  const [personState, setPersonState] = useState<PersonCreditsState | null>(null);
  const [creditsToken, setCreditsToken] = useState(0);
  const [picked, setPicked] = useState<MovieLite | null>(null);
  const [movieState, setMovieState] = useState<MovieCreditsState | null>(null);
  const [showFullCast, setShowFullCast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const credits = await getPersonCredits(personId);
        if (!cancelled) {
          setPersonState({ personId, movies: normalizeMovies(credits), error: false });
        }
      } catch {
        if (!cancelled) {
          setPersonState({ personId, movies: [], error: true });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [personId, creditsToken]);

  useEffect(() => {
    if (!picked) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const credits = await getMovieCredits(picked.id);
        if (!cancelled) {
          setMovieState({ movieId: picked.id, directors: normalizeDirectors(credits), cast: normalizeCast(credits), error: false });
        }
      } catch {
        if (!cancelled) {
          setMovieState({ movieId: picked.id, directors: [], cast: [], error: true });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [picked]);

  const activePerson = personState && personState.personId === personId ? personState : null;
  const movies = activePerson && !activePerson.error ? activePerson.movies : null;
  const moviesLoading = !activePerson;
  const moviesError = activePerson?.error === true;
  const activeMovie = movieState && picked && movieState.movieId === picked.id ? movieState : null;
  const visibleCast =
    activeMovie && !activeMovie.error ? (showFullCast ? activeMovie.cast : activeMovie.cast.slice(0, CAST_PREVIEW_COUNT)) : [];

  const onSelectPerson = async (person: PersonLite) => {
    if (!picked) {
      return;
    }
    const ok = await onHop(person, picked);
    if (ok) {
      setPicked(null);
      setMovieState(null);
      setShowFullCast(false);
    }
  };

  const onMovieSelect = (movie: MovieLite) => {
    setShowFullCast(false);
    setMovieState(null);
    setPicked(movie);
  };

  const retryMovies = () => {
    setPersonState(null);
    setCreditsToken((token) => token + 1);
  };

  return (
    <ScrollView style={[styles.browser, style]}>
      {picked ? (
        <View>
          <View style={styles.browserHeader}>
            <View style={styles.browserHeading}>
              <Text style={styles.browserTitle} numberOfLines={1}>{picked.title}</Text>
              <Text style={styles.browserSubtitle}>Select a person to continue the chain</Text>
            </View>
            <Pressable style={styles.linkButton} onPress={() => setPicked(null)}>
              <Text style={styles.linkButtonText}>← Movies</Text>
            </Pressable>
          </View>
          {!activeMovie ? <ActivityIndicator color="#cbd5e1" style={styles.loader} /> : null}
          {activeMovie?.error ? <Text style={styles.errorMessage}>Could not load this movie's credits.</Text> : null}
          {activeMovie && !activeMovie.error ? (
            <View>
              {activeMovie.directors.length > 0 ? <Text style={styles.groupTitle}>Directors</Text> : null}
              {activeMovie.directors.map((person) => (
                <PersonRow key={`director-${person.id}`} person={person} isTarget={targetPersonId === person.id} onPress={onSelectPerson} />
              ))}
              {activeMovie.cast.length > 0 ? <Text style={styles.groupTitle}>Cast</Text> : null}
              {visibleCast.map((person) => (
                <PersonRow key={`cast-${person.id}`} person={person} isTarget={targetPersonId === person.id} onPress={onSelectPerson} />
              ))}
              {activeMovie.cast.length > CAST_PREVIEW_COUNT ? (
                <Pressable style={styles.linkButton} onPress={() => setShowFullCast((value) => !value)}>
                  <Text style={styles.linkButtonText}>
                    {showFullCast ? 'Show less' : `Show all cast (${activeMovie.cast.length})`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View>
          <Text style={styles.browserTitle}>{personName}</Text>
          <Text style={styles.browserSubtitle}>Select a movie to see its cast and directors</Text>
          {moviesLoading ? <ActivityIndicator color="#cbd5e1" style={styles.loader} /> : null}
          {moviesError ? (
            <View>
              <Text style={styles.errorMessage}>Could not load this person's movies.</Text>
              <Pressable style={styles.linkButton} onPress={retryMovies}>
                <Text style={styles.linkButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {movies && movies.length === 0 ? <Text style={styles.errorMessage}>No movies found. Use Undo to go back.</Text> : null}
          {movies ? movies.map((movie) => <MovieRow key={movie.id} movie={movie} onPress={() => onMovieSelect(movie)} />) : null}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  browser: { flex: 1, marginTop: 12 },
  browserHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  browserHeading: { flexShrink: 1 },
  browserTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  browserSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2, marginBottom: 10 },
  groupTitle: { color: '#cbd5e1', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  movieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8
  },
  movieRowText: { flexShrink: 1 },
  movieRowTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  movieRowYear: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8
  },
  personRowTarget: { borderColor: '#22d3ee', borderWidth: 2 },
  personRowName: { color: '#e2e8f0', fontSize: 14, flexShrink: 1 },
  targetBadge: { backgroundColor: '#22d3ee', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  targetBadgeText: { color: '#020617', fontSize: 10, fontWeight: '800' },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 8 },
  linkButtonText: { color: '#93c5fd', fontWeight: '600' },
  loader: { marginTop: 12 },
  errorMessage: { color: '#f43f5e', marginTop: 8 }
});
