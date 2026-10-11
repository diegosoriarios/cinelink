import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsWideScreen } from '../src/hooks/useIsWideScreen';

export default function RootLayout() {
  const isWide = useIsWideScreen();

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: !isWide,
          headerStyle: { backgroundColor: '#020617' },
          headerTintColor: '#f8fafc',
          contentStyle: { backgroundColor: '#020617' }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="game/[mode]" options={{ title: 'CineLink' }} />
      </Stack>
    </>
  );
}
