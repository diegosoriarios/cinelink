import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameState } from '../../src/game/gameState';
import { useIsWideScreen } from '../../src/hooks/useIsWideScreen';

export default function StatsScreen() {
  const history = useGameState((s) => s.history);
  const streak = useGameState((s) => s.streak);
  const bestStreak = useGameState((s) => s.bestStreak);
  const isWide = useIsWideScreen();

  const played = history.length;
  const wins = history.filter((item) => item.win).length;
  const winRate = played === 0 ? 0 : Math.round((wins / played) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isWide ? styles.contentWide : null]}>
      <Text style={styles.title}>Stats</Text>

      <View style={styles.statGrid}>
        <StatCard label="Played" value={String(played)} style={isWide ? styles.cardWide : null} />
        <StatCard label="Win Rate" value={`${winRate}%`} style={isWide ? styles.cardWide : null} />
        <StatCard label="Streak" value={String(streak)} style={isWide ? styles.cardWide : null} />
        <StatCard label="Best" value={String(bestStreak)} style={isWide ? styles.cardWide : null} />
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      {history.length === 0 ? <Text style={styles.empty}>No completed daily puzzles yet.</Text> : null}
      {history
        .slice()
        .reverse()
        .map((entry) => (
          <View key={`${entry.date}-${entry.mode}`} style={styles.row}>
            <Text style={styles.date}>{entry.date}</Text>
            <Text style={styles.details}>Hops {entry.hopsUsed}</Text>
            <Text style={[styles.result, entry.win ? styles.win : styles.loss]}>{entry.win ? 'Win' : 'Loss'}</Text>
          </View>
        ))}
    </ScrollView>
  );
}

const StatCard = ({ label, value, style }: { label: string; value: string; style?: object | null }) => {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 18, paddingBottom: 30 },
  contentWide: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { color: '#f8fafc', fontSize: 34, fontWeight: '800', marginBottom: 14 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  card: {
    width: '48%',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14
  },
  cardWide: { width: '23.5%', alignItems: 'center' },
  cardValue: { color: '#f8fafc', fontSize: 24, fontWeight: '800' },
  cardLabel: { color: '#94a3b8', marginTop: 4 },
  sectionTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 10 },
  empty: { color: '#94a3b8' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8
  },
  date: { color: '#e2e8f0', width: 110 },
  details: { color: '#cbd5e1', flex: 1 },
  result: { fontWeight: '700' },
  win: { color: '#22c55e' },
  loss: { color: '#f97316' }
});
