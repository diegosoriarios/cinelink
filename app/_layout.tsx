import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TopNav } from '../src/components/TopNav';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <TopNav />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#020617' }
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="game/[mode]" />
          <Stack.Screen name="game/race" />
        </Stack>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#020617' }
});
