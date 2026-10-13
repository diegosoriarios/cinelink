import React from 'react';
import { StyleSheet, View } from 'react-native';
import RaceScreen from '../../src/screens/RaceScreen';

export default function RaceRoute() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <RaceScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { flex: 1 }
});
