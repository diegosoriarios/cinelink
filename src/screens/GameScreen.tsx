import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { getPersonCredits, getPersonDetails } from '../api/tmdb';
import { Avatar, CreditsBrowser } from '../components/CreditsBrowser';
import { useGameState } from '../game/gameState';
import { HINT_COUNT, pickHintMovies, type HintMovie } from '../game/hints';
import { useIsWideScreen } from '../hooks/useIsWideScreen';
import type { GameMode, MovieLite, PersonLite } from '../types/game';

type Props = {
  mode: GameMode;
};

const Confetti = () => {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const pieces = new Array(18).fill(0).map((_, idx) => {
    const x = (idx * 19) % 320;
    const color = ['#22d3ee', '#f43f5e', '#eab308', '#34d399', '#a78bfa'][idx % 5];
    return (
      <Animated.View
        key={idx}
        style={[
          styles.confettiPiece,
          {
            backgroundColor: color,
            transform: [
              { translateX: x },
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 260 + (idx % 4) * 30]
                })
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${240 + idx * 11}deg`]
                })
              }
            ]
          }
        ]}
      />
    );
  });

  return <View pointerEvents="none" style={styles.confettiContainer}>{pieces}</View>;
};

export const GameScreen = ({ mode }: Props) => {
  const {
    initMode,
    addHop,
    undoHop,
    tickSpeedRun,
    shareResult,
    resetCurrentMode,
    startPerson,
    targetPerson,
    hops,
    path,
    maxHops,
    hasWon,
    hasLost,
    speedRunSeconds,
    explorerWins,
    initialized,
    puzzle
  } = useGameState();
  const isWide = useIsWideScreen();

  const [message, setMessage] = useState<string | null>(null);
  const [personMap, setPersonMap] = useState<Record<number, PersonLite>>({});
  const [initError, setInitError] = useState<{ mode: GameMode; message: string } | null>(null);
  const [targetHints, setTargetHints] = useState<{ personId: number; movies: HintMovie[] } | null>(null);
  const [hintsShown, setHintsShown] = useState(0);

  const currentPersonId = path[path.length - 1];
  const gameActive = !hasWon && !hasLost;
  const activeHints = targetHints && targetPerson && targetHints.personId === targetPerson.id ? targetHints.movies : null;
  const revealedCount = hasWon || hasLost ? HINT_COUNT : hintsShown;
  const revealedHints = activeHints ? activeHints.slice(0, revealedCount) : [];
  const hintButtonVisible = gameActive && !!activeHints && hintsShown < activeHints.length;

  const startMode = useCallback(() => {
    initMode(mode).catch(() => {
      setInitError({ mode, message: 'Could not load the game. Check your connection and try again.' });
    });
  }, [initMode, mode]);

  useEffect(() => {
    startMode();
  }, [startMode]);

  useEffect(() => {
    if (mode !== 'speedrun') {
      return;
    }
    const timer = setInterval(() => {
      tickSpeedRun();
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, tickSpeedRun]);

  useEffect(() => {
    const run = async () => {
      const missing = path.filter((personId) => !personMap[personId]);
      if (missing.length === 0) {
        return;
      }
      const entries = await Promise.all(
        missing.map(async (personId) => {
          try {
            const data = await getPersonDetails(personId);
            return [personId, { id: data.id, name: data.name, profile_path: data.profile_path }] as const;
          } catch {
            return [personId, { id: personId, name: `Person ${personId}`, profile_path: null }] as const;
          }
        })
      );
      setPersonMap((current) => {
        const next = { ...current };
        for (const [id, person] of entries) {
          next[id] = person;
        }
        return next;
      });
    };
    run();
  }, [path, personMap]);

  useEffect(() => {
    const targetId = targetPerson?.id;
    if (!targetId) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const credits = await getPersonCredits(targetId);
        if (cancelled) {
          return;
        }
        setTargetHints({ personId: targetId, movies: pickHintMovies(credits) });
        setHintsShown(0);
      } catch {
        if (!cancelled) {
          setTargetHints(null);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [targetPerson?.id]);

  const onHop = async (person: PersonLite, movie: MovieLite) => {
    const result = await addHop(person.id, { id: movie.id, title: movie.title });
    if (!result.ok) {
      setMessage(result.reason ?? 'Invalid hop');
      return false;
    }
    setPersonMap((current) => ({
      ...current,
      [person.id]: person
    }));
    setMessage(null);
    return true;
  };

  const onUndo = () => {
    if (undoHop()) {
      setMessage(null);
    }
  };

  const onNextRound = () => {
    setMessage(null);
    resetCurrentMode().catch(() => {
      setInitError({ mode, message: 'Could not load the next round. Check your connection and try again.' });
    });
  };

  const onShare = async () => {
    const text = shareResult();
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'Result copied to clipboard');
      } catch {
        Alert.alert('Share', text);
      }
      return;
    }
    await Share.share({ message: text });
  };

  const timeLabel = useMemo(() => {
    const min = Math.floor(speedRunSeconds / 60)
      .toString()
      .padStart(2, '0');
    const sec = (speedRunSeconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }, [speedRunSeconds]);

  if (initError && initError.mode === mode) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{initError.message}</Text>
        <Pressable style={styles.button} onPress={startMode}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'daily' && initialized && !puzzle) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>No puzzle available today</Text>
        <Text style={styles.errorText}>Please check back later.</Text>
      </View>
    );
  }

  if (!initialized || !startPerson || !targetPerson) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#e2e8f0" />
      </View>
    );
  }

  const hud = (
    <View style={styles.hud}>
      {mode === 'daily' ? <Text style={styles.hudText}>Hops: {hops.length}/{maxHops}</Text> : null}
      {mode === 'speedrun' ? <Text style={styles.hudText}>Time: {timeLabel}</Text> : null}
      {mode === 'explorer' ? <Text style={styles.hudText}>Rounds won: {explorerWins}</Text> : null}
      {gameActive && hops.length > 0 ? (
        <Pressable onPress={onUndo} hitSlop={8}>
          <Text style={styles.undoText}>↩ Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const hintBox =
    activeHints && (revealedHints.length > 0 || hintButtonVisible) ? (
      <View style={styles.hintBox}>
        <Text style={styles.hintTitle}>Need a hint? Movies the target is known for:</Text>
        {revealedHints.map((movie, idx) => (
          <Text key={`hint-${movie.id}`} style={styles.hintText}>💡 Hint {idx + 1}: {movie.title}</Text>
        ))}
        {hintButtonVisible ? (
          <Pressable style={styles.hintButton} onPress={() => setHintsShown((count) => Math.min(activeHints.length, count + 1))}>
            <Text style={styles.hintButtonText}>💡 Reveal hint ({hintsShown}/{HINT_COUNT})</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;

  const browser = gameActive ? (
    <CreditsBrowser
      key={currentPersonId}
      personId={currentPersonId}
      personName={personMap[currentPersonId]?.name ?? startPerson.name}
      targetPersonId={targetPerson?.id ?? null}
      onHop={onHop}
    />
  ) : null;

  const winCard = hasWon ? (
    <View style={styles.endCard}>
      <Text style={styles.endTitle}>You won</Text>
      <Text style={styles.endText}>Completed in {hops.length} hops</Text>
      {mode === 'speedrun' ? <Text style={styles.endText}>Time: {timeLabel}</Text> : null}
      <View style={styles.endActions}>
        <Pressable style={styles.button} onPress={onShare}><Text style={styles.buttonText}>Share</Text></Pressable>
        {mode === 'explorer' ? (
          <Pressable style={[styles.button, styles.buttonNext]} onPress={onNextRound}>
            <Text style={styles.buttonText}>Next round →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  ) : null;

  const lossCard =
    hasLost && mode === 'daily' ? (
      <View style={styles.endCard}>
        <Text style={styles.endTitle}>Daily failed</Text>
        <Text style={styles.endText}>You used all {maxHops} hops.</Text>
        <Text style={styles.endText}>
          Shortest known path: {puzzle?.shortestPath?.join(' → ') ?? 'Not available'}
        </Text>
        <Pressable style={styles.button} onPress={onShare}><Text style={styles.buttonText}>Share</Text></Pressable>
      </View>
    ) : null;

  if (isWide) {
    return (
      <View style={[styles.root, styles.rootWide]}>
        {hasWon ? <Confetti /> : null}
        <View style={styles.desktopColumns}>
          <View style={styles.rail}>
            <View style={styles.railCards}>
              <PersonCard label="Start" name={startPerson.name} profilePath={startPerson.profile_path} />
              <PersonCard label="Target" name={targetPerson.name} profilePath={targetPerson.profile_path} />
            </View>
            {hud}
            {hintBox}
            <Text style={styles.sectionTitle}>Current Path</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineNode}>
                <Text style={styles.timelineNodeText}>{startPerson.name}</Text>
              </View>
              {hops.map((hop, idx) => (
                <React.Fragment key={`${hop.fromPersonId}-${hop.toPersonId}-${idx}`}>
                  <View style={styles.timelineEdge}>
                    <Text style={styles.timelineEdgeText}>{hop.sharedMovieTitle}</Text>
                  </View>
                  <View style={styles.timelineNode}>
                    <Text style={styles.timelineNodeText}>{personMap[hop.toPersonId]?.name ?? `#${hop.toPersonId}`}</Text>
                  </View>
                </React.Fragment>
              ))}
              {!hasWon ? (
                <React.Fragment>
                  <View style={[styles.timelineEdge, styles.timelineEdgePending]}>
                    <Text style={styles.timelineEdgeText}>?</Text>
                  </View>
                  <View style={[styles.timelineNode, styles.timelineNodeTarget]}>
                    <Text style={[styles.timelineNodeText, styles.timelineNodeTargetText]}>{targetPerson.name}</Text>
                  </View>
                </React.Fragment>
              ) : null}
            </View>
            {winCard}
            {lossCard}
          </View>
          <View style={styles.browserPane}>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {browser}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {hasWon ? <Confetti /> : null}

      <View style={styles.headerRow}>
        <PersonCard label="Start" name={startPerson.name} profilePath={startPerson.profile_path} />
        <Text style={styles.arrow}>→</Text>
        <PersonCard label="Target" name={targetPerson.name} profilePath={targetPerson.profile_path} />
      </View>

      {hud}
      {hintBox}

      <Text style={styles.sectionTitle}>Current Path</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pathContainer}>
        <View style={styles.node}><Text style={styles.nodeText}>{startPerson.name}</Text></View>
        {hops.map((hop, idx) => (
          <React.Fragment key={`${hop.fromPersonId}-${hop.toPersonId}-${idx}`}>
            <View style={styles.edge}><Text style={styles.edgeText}>{hop.sharedMovieTitle}</Text></View>
            <View style={styles.node}><Text style={styles.nodeText}>{personMap[hop.toPersonId]?.name ?? `#${hop.toPersonId}`}</Text></View>
          </React.Fragment>
        ))}
      </ScrollView>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {browser}
      {winCard}
      {lossCard}
    </View>
  );
};

const PersonCard = ({ label, name, profilePath }: { label: string; name: string; profilePath: string | null }) => {
  return (
    <View style={styles.personCard}>
      <Avatar path={profilePath} size={52} />
      <Text style={styles.personLabel}>{label}</Text>
      <Text style={styles.personName}>{name}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617', padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  rootWide: { maxWidth: 1080 },
  desktopColumns: { flex: 1, flexDirection: 'row', gap: 20 },
  rail: { width: 340, flexShrink: 0 },
  railCards: { gap: 10 },
  browserPane: { flex: 1 },
  timeline: { gap: 6, paddingBottom: 8 },
  timelineNode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start'
  },
  timelineNodeText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  timelineNodeTarget: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#22d3ee', borderStyle: 'dashed' },
  timelineNodeTargetText: { color: '#22d3ee' },
  timelineEdge: {
    marginLeft: 18,
    backgroundColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start'
  },
  timelineEdgeText: { color: '#e2e8f0', fontSize: 12 },
  timelineEdgePending: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569', borderStyle: 'dashed' },
  centered: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  errorTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  errorText: { color: '#cbd5e1', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  personCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  personLabel: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  personName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  arrow: { color: '#cbd5e1', fontSize: 20, marginHorizontal: 8 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  hudText: { color: '#cbd5e1', fontSize: 14 },
  undoText: { color: '#93c5fd', fontWeight: '600' },
  hintBox: { marginTop: 10, backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  hintTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  hintText: { color: '#fbbf24', fontSize: 13 },
  hintButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: '#1e293b',
    borderColor: '#fbbf24',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  hintButtonText: { color: '#fbbf24', fontWeight: '700', fontSize: 13 },
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  pathContainer: { alignItems: 'center', paddingBottom: 8 },
  node: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  nodeText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  edge: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  edgeText: { color: '#e2e8f0', fontSize: 12 },
  message: { marginTop: 12, color: '#93c5fd' },
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
  errorMessage: { color: '#f43f5e', marginTop: 8 },
  endCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 14,
    gap: 8
  },
  endTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  endText: { color: '#cbd5e1', fontSize: 14 },
  button: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  buttonText: { color: '#f8fafc', fontWeight: '700' },
  endActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  buttonNext: { backgroundColor: '#16a34a' },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    zIndex: 20,
    overflow: 'hidden'
  },
  confettiPiece: {
    position: 'absolute',
    top: -20,
    width: 8,
    height: 12,
    borderRadius: 2
  }
});

export default GameScreen;
