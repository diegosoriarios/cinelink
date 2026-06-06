import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';
import GameScreen from '../../src/screens/GameScreen';
import type { GameMode } from '../../src/types/game';

const isGameMode = (value: string): value is GameMode => {
  return value === 'daily' || value === 'explorer' || value === 'speedrun';
};

export default function ModeGameScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const modeParam = typeof params.mode === 'string' ? params.mode : 'daily';
  const mode: GameMode = isGameMode(modeParam) ? modeParam : 'daily';

  return (
    <SafeAreaView style={styles.container}>
      <GameScreen mode={mode} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' }
});
