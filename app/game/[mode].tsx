import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import GameScreen from '../../src/screens/GameScreen';
import type { GameMode } from '../../src/types/game';

const isGameMode = (value: string): value is GameMode => {
  return value === 'daily' || value === 'explorer' || value === 'speedrun';
};

export function generateStaticParams(): { mode: GameMode }[] {
  return [{ mode: 'daily' }, { mode: 'explorer' }, { mode: 'speedrun' }];
}

export default function ModeGameScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const modeParam = typeof params.mode === 'string' ? params.mode : 'daily';
  const mode: GameMode = isGameMode(modeParam) ? modeParam : 'daily';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <GameScreen mode={mode} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E12' },
  content: { flex: 1 }
});
