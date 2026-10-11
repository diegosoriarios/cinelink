import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import GameScreen from '../../src/screens/GameScreen';
import { TopNav } from '../../src/components/TopNav';
import { useIsWideScreen } from '../../src/hooks/useIsWideScreen';
import type { GameMode } from '../../src/types/game';

const isGameMode = (value: string): value is GameMode => {
  return value === 'daily' || value === 'explorer' || value === 'speedrun';
};

export default function ModeGameScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const modeParam = typeof params.mode === 'string' ? params.mode : 'daily';
  const mode: GameMode = isGameMode(modeParam) ? modeParam : 'daily';
  const isWide = useIsWideScreen();

  return (
    <SafeAreaView style={styles.container}>
      {isWide ? <TopNav /> : null}
      <View style={styles.content}>
        <GameScreen mode={mode} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { flex: 1 }
});
