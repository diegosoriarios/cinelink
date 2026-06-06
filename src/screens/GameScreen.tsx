import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { getImageUrl, getPersonDetails, searchPerson } from '../api/tmdb';
import { useGameState } from '../game/gameState';
import type { GameMode, PersonLite } from '../types/game';

type Props = {
  mode: GameMode;
};

const Confetti = () => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true
      })
    ).start();
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
    tickSpeedRun,
    shareResult,
    startPerson,
    targetPerson,
    hops,
    path,
    maxHops,
    hasWon,
    hasLost,
    speedRunSeconds,
    initialized,
    puzzle
  } = useGameState();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [personMap, setPersonMap] = useState<Record<number, PersonLite>>({});

  useEffect(() => {
    initMode(mode);
  }, [initMode, mode]);

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
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchPerson(query);
        setResults(data.slice(0, 8));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const onSelectPerson = async (person: PersonLite) => {
    const result = await addHop(person.id);
    if (!result.ok) {
      setMessage(result.reason ?? 'Invalid hop');
      return;
    }
    setPersonMap((current) => ({
      ...current,
      [person.id]: person
    }));
    setQuery('');
    setResults([]);
    setMessage(`Connected via ${result.hop?.sharedMovieTitle}`);
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

  if (!initialized || !startPerson || !targetPerson) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#e2e8f0" />
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

      <View style={styles.hud}>
        {mode === 'daily' ? <Text style={styles.hudText}>Hops: {hops.length}/{maxHops}</Text> : null}
        {mode === 'speedrun' ? <Text style={styles.hudText}>Time: {timeLabel}</Text> : null}
      </View>

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

      {!hasWon && !hasLost ? (
        <View style={styles.searchWrap}>
          <TextInput
            placeholder="Search actor or director"
            placeholderTextColor="#64748b"
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
          />
          {searching ? <ActivityIndicator style={styles.searchLoader} color="#cbd5e1" /> : null}
          {results.length > 0 ? (
            <View style={styles.dropdown}>
              {results.map((person) => (
                <Pressable key={person.id} style={styles.resultRow} onPress={() => onSelectPerson(person)}>
                  <Avatar path={person.profile_path} size={30} />
                  <Text style={styles.resultName}>{person.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {hasWon ? (
        <View style={styles.endCard}>
          <Text style={styles.endTitle}>You won</Text>
          <Text style={styles.endText}>Completed in {hops.length} hops</Text>
          {mode === 'speedrun' ? <Text style={styles.endText}>Time: {timeLabel}</Text> : null}
          <Pressable style={styles.button} onPress={onShare}><Text style={styles.buttonText}>Share</Text></Pressable>
        </View>
      ) : null}

      {hasLost && mode === 'daily' ? (
        <View style={styles.endCard}>
          <Text style={styles.endTitle}>Daily failed</Text>
          <Text style={styles.endText}>You used all {maxHops} hops.</Text>
          <Text style={styles.endText}>
            Shortest known path: {puzzle?.shortestPath?.join(' → ') ?? 'Not available'}
          </Text>
          <Pressable style={styles.button} onPress={onShare}><Text style={styles.buttonText}>Share</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
};

const Avatar = ({ path, size }: { path: string | null; size: number }) => {
  const uri = getImageUrl(path);
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1e293b' }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#334155' }} />
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
  root: { flex: 1, backgroundColor: '#020617', padding: 16 },
  centered: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
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
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  pathContainer: { alignItems: 'center', paddingBottom: 8 },
  node: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  nodeText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  edge: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  edgeText: { color: '#e2e8f0', fontSize: 12 },
  searchWrap: { marginTop: 18 },
  input: {
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  searchLoader: { marginTop: 8 },
  dropdown: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    overflow: 'hidden'
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10 },
  resultName: { color: '#e2e8f0', fontSize: 14 },
  message: { marginTop: 12, color: '#93c5fd' },
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
