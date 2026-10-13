import React, { useEffect, useMemo } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import puzzles from '../../src/data/puzzles.json';
import posters from '../../src/data/posters.json';
import { PosterBackground } from '../../src/components/PosterBackground';
import { useGameState } from '../../src/game/gameState';
import { useTodayISO } from '../../src/hooks/useTodayISO';
import { isRaceConfigured } from '../../src/net/raceClient';

export default function HomeScreen() {
  const initMode = useGameState((s) => s.initMode);
  const streak = useGameState((s) => s.streak);
  const raceAvailable = isRaceConfigured();
  const today = useTodayISO();
  const puzzle = useMemo(
    () =>
      today
        ? (puzzles as { date: string; startName: string; endName: string }[]).find((p) => p.date === today)
        : undefined,
    [today]
  );
  const posterPaths = useMemo(() => (posters as { poster_path: string }[]).map((entry) => entry.poster_path), []);

  useEffect(() => {
    initMode('daily');
  }, [initMode]);

  return (
    <View style={styles.container}>
      <PosterBackground paths={posterPaths} />
      <View style={styles.overlay} pointerEvents="none" />
      <View style={styles.content}>
        <Text style={styles.title}>CineLink</Text>
        <Text style={styles.subtitle}>Connect stars through shared movie credits</Text>

        <View style={styles.dailyCard}>
          <Text style={styles.label}>Today’s Daily Puzzle</Text>
          <Text style={styles.pair}>{puzzle?.startName ?? 'Start'} → {puzzle?.endName ?? 'Target'}</Text>
          <Text style={styles.streak}>Current streak: {streak}</Text>
          <Link href="/game/daily" asChild>
            <Pressable style={styles.primaryButton}><Text style={styles.primaryText}>Play Daily</Text></Pressable>
          </Link>
        </View>

        <Link href="/game/explorer" asChild>
          <Pressable style={styles.secondaryButton}><Text style={styles.secondaryText}>Explorer Mode</Text></Pressable>
        </Link>

        <Link href="/game/speedrun" asChild>
          <Pressable style={styles.secondaryButton}><Text style={styles.secondaryText}>Speed Run</Text></Pressable>
        </Link>

        {raceAvailable ? (
          <Link href="/game/race" asChild>
            <Pressable style={styles.secondaryButton}><Text style={styles.secondaryText}>Race a friend</Text></Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 20, justifyContent: 'center', overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.82)' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', zIndex: 1 },
  title: { color: '#f8fafc', fontSize: 40, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 15, marginBottom: 20 },
  dailyCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 10
  },
  label: { color: '#cbd5e1', fontWeight: '700' },
  pair: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },
  streak: { color: '#93c5fd' },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#f8fafc', fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  secondaryText: { color: '#e2e8f0', fontWeight: '600' }
});
