import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { getImageUrl, getPersonCredits, getTitleCredits, type PersonCreditsResponse } from '../api/tmdb';
import { mediaKey } from '../game/media';
import type { MovieLite, PersonId, PersonLite } from '../types/game';

const CAST_PREVIEW_COUNT = 15;
const SILENT_RETRY_DELAY_MS = 800;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const releaseTime = (movie: MovieLite) => (movie.release_date ? Date.parse(movie.release_date) : 0);

const byReleaseDesc = (a: MovieLite, b: MovieLite) => releaseTime(b) - releaseTime(a);

const normalizeTitles = (credits: PersonCreditsResponse): MovieLite[] => {
  const seen = new Set<string>();
  const titles: MovieLite[] = [];
  const push = (credit: { id: number; title: string; media_type: MovieLite['mediaType']; release_date?: string; poster_path?: string | null }) => {
    if (!credit?.id || !credit.title) {
      return;
    }
    const key = mediaKey(credit.media_type, credit.id);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    titles.push({
      id: credit.id,
      title: credit.title,
      mediaType: credit.media_type,
      release_date: credit.release_date,
      poster_path: credit.poster_path ?? null
    });
  };
  credits.cast.forEach(push);
  credits.crew.forEach(push);
  return titles.sort(byReleaseDesc);
};

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
        <Text style={styles.movieRowYear}>
          {movie.mediaType === 'tv' ? 'TV' : 'Film'}
          {movie.release_date ? ` · ${movie.release_date.slice(0, 4)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
};

type PersonCreditsState = { personId: PersonId; titles: MovieLite[]; error: boolean };
type TitleCreditsState = { mediaType: MovieLite['mediaType']; id: number; creators: PersonLite[]; cast: PersonLite[]; error: boolean };

type Props = {
  personId: PersonId;
  personName: string;
  targetPersonId: PersonId | null;
  onHop: (person: PersonLite, movie: MovieLite) => boolean | Promise<boolean>;
  scrollOffsets?: Map<string, number>;
  style?: StyleProp<ViewStyle>;
};

export const CreditsBrowser = ({ personId, personName, targetPersonId, onHop, scrollOffsets, style }: Props) => {
  const [personState, setPersonState] = useState<PersonCreditsState | null>(null);
  const [creditsToken, setCreditsToken] = useState(0);
  const [picked, setPicked] = useState<MovieLite | null>(null);
  const [titleState, setTitleState] = useState<TitleCreditsState | null>(null);
  const [titleCreditsToken, setTitleCreditsToken] = useState(0);
  const [showFullCast, setShowFullCast] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [localOffsets] = useState(() => new Map<string, number>());
  const offsets = scrollOffsets ?? localOffsets;
  const pendingRestoreRef = useRef<{ key: string; y: number } | null>(null);

  const viewKey = picked ? `${personId}:${picked.mediaType}:${picked.id}` : `${personId}:titles`;

  const activePerson = personState && personState.personId === personId ? personState : null;
  const titles = activePerson && !activePerson.error ? activePerson.titles : null;
  const titlesLoading = !activePerson;
  const titlesError = activePerson?.error === true;
  const activeTitle = titleState && picked && titleState.id === picked.id && titleState.mediaType === picked.mediaType ? titleState : null;
  const visibleCast =
    activeTitle && !activeTitle.error ? (showFullCast ? activeTitle.cast : activeTitle.cast.slice(0, CAST_PREVIEW_COUNT)) : [];
  const creatorLabel = picked?.mediaType === 'tv' ? 'Creators' : 'Directors';

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const credits = await getPersonCredits(personId);
          if (!cancelled) {
            setPersonState({ personId, titles: normalizeTitles(credits), error: false });
          }
          return;
        } catch {
          if (cancelled) {
            return;
          }
          if (attempt === 0) {
            await delay(SILENT_RETRY_DELAY_MS);
            if (cancelled) {
              return;
            }
          }
        }
      }
      if (!cancelled) {
        setPersonState({ personId, titles: [], error: true });
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
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const credits = await getTitleCredits(picked.mediaType, picked.id);
          if (!cancelled) {
            setTitleState({ mediaType: picked.mediaType, id: picked.id, creators: credits.creators, cast: credits.cast, error: false });
          }
          return;
        } catch {
          if (cancelled) {
            return;
          }
          if (attempt === 0) {
            await delay(SILENT_RETRY_DELAY_MS);
            if (cancelled) {
              return;
            }
          }
        }
      }
      if (!cancelled) {
        setTitleState({ mediaType: picked.mediaType, id: picked.id, creators: [], cast: [], error: true });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [picked, titleCreditsToken]);

  useEffect(() => {
    const saved = offsets.get(viewKey);
    pendingRestoreRef.current = saved && saved > 0 ? { key: viewKey, y: saved } : null;
  }, [viewKey, offsets]);

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending || pending.key !== viewKey) {
      return;
    }
    const contentReady = picked ? !!activeTitle && !activeTitle.error : !!titles;
    if (!contentReady) {
      return;
    }
    const target = pending.y;
    const frame = requestAnimationFrame(() => {
      pendingRestoreRef.current = null;
      scrollRef.current?.scrollTo({ y: target, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  });

  const onSelectPerson = async (person: PersonLite) => {
    if (!picked) {
      return;
    }
    const ok = await onHop(person, picked);
    if (ok) {
      setPicked(null);
      setTitleState(null);
      setShowFullCast(false);
    }
  };

  const onMovieSelect = (movie: MovieLite) => {
    setShowFullCast(false);
    setTitleState(null);
    setPicked(movie);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsets.set(viewKey, event.nativeEvent.contentOffset.y);
  };

  const retryMovies = () => {
    setPersonState(null);
    setCreditsToken((token) => token + 1);
  };

  const retryTitle = () => {
    setTitleState(null);
    setTitleCreditsToken((token) => token + 1);
  };

  return (
    <ScrollView ref={scrollRef} style={[styles.browser, style]} onScroll={handleScroll} scrollEventThrottle={16}>
      {picked ? (
        <View>
          <View style={styles.browserHeader}>
            <View style={styles.browserHeading}>
              <Text style={styles.browserTitle} numberOfLines={1}>{picked.title}</Text>
              <Text style={styles.browserSubtitle}>Select a person to continue the chain</Text>
            </View>
            <Pressable style={styles.linkButton} onPress={() => setPicked(null)}>
              <Text style={styles.linkButtonText}>← Titles</Text>
            </Pressable>
          </View>
          {!activeTitle ? <ActivityIndicator color="#cbd5e1" style={styles.loader} /> : null}
          {activeTitle?.error ? (
            <View>
              <Text style={styles.errorMessage}>Could not load this title's credits.</Text>
              <Pressable style={styles.linkButton} onPress={retryTitle}>
                <Text style={styles.linkButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {activeTitle && !activeTitle.error ? (
            <View>
              {activeTitle.creators.length > 0 ? <Text style={styles.groupTitle}>{creatorLabel}</Text> : null}
              {activeTitle.creators.map((person) => (
                <PersonRow key={`creator-${person.id}`} person={person} isTarget={targetPersonId === person.id} onPress={onSelectPerson} />
              ))}
              {activeTitle.cast.length > 0 ? <Text style={styles.groupTitle}>Cast</Text> : null}
              {visibleCast.map((person) => (
                <PersonRow key={`cast-${person.id}`} person={person} isTarget={targetPersonId === person.id} onPress={onSelectPerson} />
              ))}
              {activeTitle.cast.length > CAST_PREVIEW_COUNT ? (
                <Pressable style={styles.linkButton} onPress={() => setShowFullCast((value) => !value)}>
                  <Text style={styles.linkButtonText}>
                    {showFullCast ? 'Show less' : `Show all cast (${activeTitle.cast.length})`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View>
          <Text style={styles.browserTitle}>{personName}</Text>
          <Text style={styles.browserSubtitle}>Select a title to see its credits</Text>
          {titlesLoading ? <ActivityIndicator color="#cbd5e1" style={styles.loader} /> : null}
          {titlesError ? (
            <View>
              <Text style={styles.errorMessage}>Could not load this person's movies.</Text>
              <Pressable style={styles.linkButton} onPress={retryMovies}>
                <Text style={styles.linkButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {titles && titles.length === 0 ? <Text style={styles.errorMessage}>No movies found. Use Undo to go back.</Text> : null}
          {titles ? titles.map((movie) => <MovieRow key={`${movie.mediaType}-${movie.id}`} movie={movie} onPress={() => onMovieSelect(movie)} />) : null}
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
  targetBadgeText: { color: '#0B0E12', fontSize: 10, fontWeight: '800' },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 8 },
  linkButtonText: { color: '#93c5fd', fontWeight: '600' },
  loader: { marginTop: 12 },
  errorMessage: { color: '#f43f5e', marginTop: 8 }
});
