import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#020617' }
          }}
        >
          <Stack.Screen name="index" />
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
