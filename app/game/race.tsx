import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import RaceScreen from '../../src/screens/RaceScreen';
import { TopNav } from '../../src/components/TopNav';
import { useIsWideScreen } from '../../src/hooks/useIsWideScreen';

export default function RaceRoute() {
  const isWide = useIsWideScreen();

  return (
    <SafeAreaView style={styles.container}>
      {isWide ? <TopNav /> : null}
      <View style={styles.content}>
        <RaceScreen />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { flex: 1 }
});
