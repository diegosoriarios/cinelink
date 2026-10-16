import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Avatar, CreditsBrowser } from '../components/CreditsBrowser';
import { useIsWideScreen } from '../hooks/useIsWideScreen';
import { useRaceStore } from '../net/raceStore';
import type { MovieLite, PersonLite } from '../types/game';
import type { RacePerson } from '../types/race';

const RACE_DURATION_SECONDS = 5 * 60;

const formatClock = (totalSeconds: number) => {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (clamped % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const RacePersonCard = ({ label, person }: { label: string; person: RacePerson }) => (
  <View style={styles.personCard}>
    <Avatar path={person.profile_path} size={48} />
    <Text style={styles.personLabel}>{label}</Text>
    <Text style={styles.personName}>{person.name}</Text>
  </View>
);

export const RaceScreen = () => {
  const {
    status,
    configured,
    code,
    phase,
    players,
    selfId,
    startPerson,
    targetPerson,
    personMap,
    path,
    hops,
    opponentHops,
    opponentName,
    countdownEndsAt,
    raceStartedAt,
    result,
    message,
    hydrate,
    updateNickname,
    createRoom,
    joinRoom,
    leave,
    startRace,
    addHop,
    undoHop,
    claim,
    rematch
  } = useRaceStore();

  const isWide = useIsWideScreen();
  const [nicknameInput, setNicknameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    hydrate().then(() => {
      const stored = useRaceStore.getState().nickname;
      if (stored) {
        setNicknameInput(stored);
      }
    });
    return () => {
      leave();
    };
  }, [hydrate, leave]);

  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'racing') {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const selfIsHost = players.find((player) => player.playerId === selfId)?.isHost ?? false;
  const currentPersonId = path[path.length - 1] ?? startPerson?.id ?? null;
  const currentPersonName = currentPersonId
    ? personMap[currentPersonId]?.name ?? startPerson?.name ?? `Person ${currentPersonId}`
    : '';
  const reachedTarget = Boolean(targetPerson && currentPersonId === targetPerson.id);
  const banner = message ?? localMessage;

  const countdownLeft = countdownEndsAt ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000)) : 0;
  const timeLeft = raceStartedAt ? RACE_DURATION_SECONDS - Math.floor((now - raceStartedAt) / 1000) : RACE_DURATION_SECONDS;

  const onCreate = useCallback(async () => {
    setLocalMessage(null);
    await updateNickname(nicknameInput);
    createRoom();
  }, [createRoom, nicknameInput, updateNickname]);

  const onJoin = useCallback(async () => {
    setLocalMessage(null);
    await updateNickname(nicknameInput);
    joinRoom(codeInput);
  }, [codeInput, joinRoom, nicknameInput, updateNickname]);

  const onHop = useCallback(
    (person: PersonLite, movie: MovieLite) => {
      const outcome = addHop(person, movie);
      if (!outcome.ok) {
        setLocalMessage(outcome.reason ?? 'Invalid hop');
        return false;
      }
      setLocalMessage(null);
      return true;
    },
    [addHop]
  );

  const onShare = async () => {
    const winner = result?.winnerId === selfId ? 'won' : result?.winnerId ? 'lost' : 'drew';
    const text = `CineLink Race ${code ?? ''}\n${winner} with ${hops.length} hops`;
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

  const shareRoomCode = async () => {
    if (!code) {
      return;
    }
    const text = `Race me on CineLink! Room code: ${code}`;
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(code);
        Alert.alert('Copied', `Room code ${code} copied`);
      } catch {
        Alert.alert('Room code', code);
      }
      return;
    }
    await Share.share({ message: text });
  };

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Multiplayer unavailable</Text>
        <Text style={styles.errorText}>This build has no race server configured (EXPO_PUBLIC_RACE_URL).</Text>
      </View>
    );
  }

  if (status === 'loading' && !code) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#e2e8f0" />
      </View>
    );
  }

  if (status === 'error' && !code) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{message ?? 'Could not reach the race server.'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => leave()}>
          <Text style={styles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'lobby' && !code) {
    return (
      <ScrollView contentContainerStyle={styles.entryContainer}>
        <Text style={styles.title}>Race a friend</Text>
        <Text style={styles.subtitle}>Same start and target. First to connect them wins.</Text>

        <Text style={styles.fieldLabel}>Your nickname</Text>
        <TextInput
          value={nicknameInput}
          onChangeText={setNicknameInput}
          placeholder="e.g. FilmBuff"
          placeholderTextColor="#64748b"
          maxLength={24}
          style={styles.input}
          autoCapitalize="words"
        />

        <Pressable style={styles.primaryButton} onPress={onCreate}>
          <Text style={styles.primaryText}>Create a room</Text>
        </Pressable>

        <Text style={styles.orLabel}>or join with a code</Text>
        <View style={styles.joinRow}>
          <TextInput
            value={codeInput}
            onChangeText={(value) => setCodeInput(value.toUpperCase().slice(0, 4))}
            placeholder="CODE"
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={4}
            style={[styles.input, styles.codeInput]}
          />
          <Pressable style={styles.secondaryButton} onPress={onJoin}>
            <Text style={styles.secondaryText}>Join</Text>
          </Pressable>
        </View>

        {banner ? <Text style={styles.message}>{banner}</Text> : null}
      </ScrollView>
    );
  }

  if (phase === 'lobby' && code) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Room {code}</Text>
        <Pressable onPress={shareRoomCode} hitSlop={8}>
          <Text style={styles.shareCode}>Share code ({code})</Text>
        </Pressable>
        <View style={styles.playerList}>
          {players.map((player) => (
            <Text key={player.playerId} style={styles.playerRow}>
              {player.nickname}
              {player.isHost ? ' (host)' : ''}
              {player.playerId === selfId ? ' — you' : ''}
            </Text>
          ))}
        </View>
        {players.length < 2 ? <Text style={styles.waiting}>Waiting for your opponent to join…</Text> : null}
        {selfIsHost && players.length === 2 ? (
          <Pressable style={styles.primaryButton} onPress={startRace}>
            <Text style={styles.primaryText}>Start race</Text>
          </Pressable>
        ) : !selfIsHost ? (
          <Text style={styles.waiting}>Waiting for the host to start…</Text>
        ) : null}
        <Pressable style={styles.linkButton} onPress={() => leave()}>
          <Text style={styles.linkButtonText}>Leave room</Text>
        </Pressable>
        {banner ? <Text style={styles.message}>{banner}</Text> : null}
      </View>
    );
  }

  if (phase === 'countdown') {
    return (
      <View style={styles.centered}>
        <Text style={styles.countdown}>{countdownLeft > 0 ? countdownLeft : 'Go!'}</Text>
        {startPerson && targetPerson ? (
          <View style={styles.headerRow}>
            <RacePersonCard label="Start" person={startPerson} />
            <Text style={styles.arrow}>→</Text>
            <RacePersonCard label="Target" person={targetPerson} />
          </View>
        ) : null}
      </View>
    );
  }

  if (phase === 'finished') {
    const outcome = result?.winnerId === selfId ? 'You won' : result?.winnerId ? 'You lost' : "It's a draw";
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{outcome}</Text>
        {result?.reason ? <Text style={styles.subtitle}>Result: {result.reason}</Text> : null}
        <Text style={styles.subtitle}>
          Your hops: {hops.length} · {opponentName ?? 'Opponent'}: {opponentHops}
        </Text>
        <View style={styles.resultActions}>
          <Pressable style={styles.primaryButton} onPress={rematch}>
            <Text style={styles.primaryText}>Rematch</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onShare}>
            <Text style={styles.secondaryText}>Share</Text>
          </Pressable>
        </View>
        <Pressable style={styles.linkButton} onPress={() => leave()}>
          <Text style={styles.linkButtonText}>Leave room</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'racing' && startPerson && targetPerson && currentPersonId) {
    const hud = (
      <View style={styles.hud}>
        <Text style={styles.hudText}>Your hops: {hops.length}</Text>
        <Text style={styles.hudText}>
          {opponentName ?? 'Opponent'}: {opponentHops}
        </Text>
        <Text style={styles.hudText}>Time: {formatClock(timeLeft)}</Text>
      </View>
    );

    const actions = (
      <View style={styles.raceActions}>
        {reachedTarget ? (
          <Pressable style={styles.primaryButton} onPress={claim}>
            <Text style={styles.primaryText}>Claim victory</Text>
          </Pressable>
        ) : null}
        {hops.length > 0 ? (
          <Pressable onPress={undoHop} hitSlop={8}>
            <Text style={styles.undoText}>↩ Undo</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => leave()} hitSlop={8}>
          <Text style={styles.linkButtonText}>Leave</Text>
        </Pressable>
      </View>
    );

    const pathRail = (
      <View>
        <Text style={styles.sectionTitle}>Your path</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pathContainer}>
          <View style={styles.node}><Text style={styles.nodeText}>{startPerson.name}</Text></View>
          {hops.map((hop) => (
            <React.Fragment key={`${hop.fromPersonId}-${hop.toPersonId}`}>
              <View style={styles.edge}><Text style={styles.edgeText}>{hop.sharedMediaTitle}</Text></View>
              <View style={styles.node}>
                <Text style={styles.nodeText}>{personMap[hop.toPersonId]?.name ?? `#${hop.toPersonId}`}</Text>
              </View>
            </React.Fragment>
          ))}
        </ScrollView>
      </View>
    );

    const browser = (
      <CreditsBrowser
        key={currentPersonId}
        personId={currentPersonId}
        personName={currentPersonName}
        targetPersonId={targetPerson.id}
        onHop={onHop}
        style={styles.browser}
      />
    );

    if (isWide) {
      return (
        <View style={[styles.root, styles.rootWide]}>
          <View style={styles.desktopColumns}>
            <View style={styles.rail}>
              <View style={styles.railCards}>
                <RacePersonCard label="Start" person={startPerson} />
                <RacePersonCard label="Target" person={targetPerson} />
              </View>
              {hud}
              {pathRail}
              {actions}
              {banner ? <Text style={styles.message}>{banner}</Text> : null}
            </View>
            <View style={styles.browserPane}>{browser}</View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <RacePersonCard label="Start" person={startPerson} />
          <Text style={styles.arrow}>→</Text>
          <RacePersonCard label="Target" person={targetPerson} />
        </View>
        {hud}
        {pathRail}
        {actions}
        {banner ? <Text style={styles.message}>{banner}</Text> : null}
        {browser}
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#e2e8f0" />
      <Pressable style={styles.linkButton} onPress={() => leave()}>
        <Text style={styles.linkButtonText}>Leave room</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0E12', padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  rootWide: { maxWidth: 1080 },
  desktopColumns: { flex: 1, flexDirection: 'row', gap: 20 },
  rail: { width: 340, flexShrink: 0 },
  railCards: { gap: 10 },
  browserPane: { flex: 1 },
  browser: { marginTop: 0 },
  entryContainer: { padding: 20, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 10 },
  centered: { flex: 1, backgroundColor: '#0B0E12', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 15, textAlign: 'center' },
  errorTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorText: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
  fieldLabel: { color: '#cbd5e1', fontWeight: '700', marginTop: 8 },
  input: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 16
  },
  codeInput: { flex: 1, letterSpacing: 4, textAlign: 'center', textTransform: 'uppercase' },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  orLabel: { color: '#64748b', textAlign: 'center', marginTop: 8 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  primaryText: { color: '#f8fafc', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center'
  },
  secondaryText: { color: '#e2e8f0', fontWeight: '600', fontSize: 15 },
  shareCode: { color: '#93c5fd', fontWeight: '600', fontSize: 15 },
  playerList: { gap: 4, marginTop: 6 },
  playerRow: { color: '#e2e8f0', fontSize: 15, textAlign: 'center' },
  waiting: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  countdown: { color: '#f8fafc', fontSize: 72, fontWeight: '800' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' },
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
  hud: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' },
  hudText: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  pathContainer: { alignItems: 'center', paddingBottom: 8 },
  node: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  nodeText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  edge: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  edgeText: { color: '#e2e8f0', fontSize: 12 },
  raceActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  undoText: { color: '#93c5fd', fontWeight: '600' },
  linkButton: { alignSelf: 'center', paddingVertical: 10 },
  linkButtonText: { color: '#93c5fd', fontWeight: '600' },
  message: { marginTop: 12, color: '#93c5fd', textAlign: 'center' }
});

export default RaceScreen;
