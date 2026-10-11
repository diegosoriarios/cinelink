import React from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const TopNav = () => {
  return (
    <View style={styles.nav}>
      <Link href="/" asChild>
        <Pressable hitSlop={8}>
          <Text style={styles.wordmark}>🎬 CineLink</Text>
        </Pressable>
      </Link>
      <View style={styles.links}>
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
    paddingVertical: 12
  },
  wordmark: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  links: { flexDirection: 'row', gap: 20 },
  linkText: { color: '#93c5fd', fontSize: 15, fontWeight: '600' }
});
