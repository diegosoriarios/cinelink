import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useIsWideScreen } from '../../src/hooks/useIsWideScreen';
import { TopNav } from '../../src/components/TopNav';

export default function TabsLayout() {
  const isWide = useIsWideScreen();

  return (
    <View style={styles.shell}>
      {isWide ? <TopNav /> : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: isWide
            ? { display: 'none' }
            : {
                backgroundColor: '#0f172a',
                borderTopColor: '#1e293b'
              },
          tabBarActiveTintColor: '#f8fafc',
          tabBarInactiveTintColor: '#64748b'
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#020617' }
});
