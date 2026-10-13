import React from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsWideScreen } from '../hooks/useIsWideScreen';
import { isRaceConfigured } from '../net/raceClient';

export const TopNav = () => {
  const raceAvailable = isRaceConfigured();
  const isWide = useIsWideScreen();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.nav, { paddingTop: insets.top + 12 }]}>
      {isWide ? (
        <Link href="/" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.wordmark}>🎬 CineLink</Text>
          </Pressable>
        </Link>
      ) : null}
      <View style={[styles.links, isWide ? null : styles.linksEnd]}>
        <Link href="/" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.linkText}>Home</Text>
          </Pressable>
        </Link>
        <Link href="/stats" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.linkText}>Stats</Text>
          </Pressable>
        </Link>
        {raceAvailable ? (
          <Link href="/game/race" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.linkText}>Race</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderBottomColor: '#1e293b',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 12
  },
  wordmark: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  links: { flexDirection: 'row', gap: 20 },
  linksEnd: { flex: 1, justifyContent: 'flex-end' },
  linkText: { color: '#93c5fd', fontSize: 15, fontWeight: '600' }
});
