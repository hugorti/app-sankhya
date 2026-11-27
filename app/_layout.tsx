// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { initializeAPI } from '../services/api';

export default function RootLayout() {
  useEffect(() => {
    initializeAPI().catch((err) => {
      console.error('❌ initializeAPI:', err);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expedicao" />
        <Stack.Screen name="conferencia" />
        <Stack.Screen name="conferenciaList" />
        <Stack.Screen name="separacao" />
      </Stack>
    </GestureHandlerRootView>
  );
}