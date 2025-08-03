// app/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { ActivityIndicator, View } from 'react-native';
import { useEffect } from 'react';

export default function RootLayout() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!session) {
        router.replace('/login');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen 
        name="login" 
        options={{ 
          title: 'Login Sankhya',
          headerShown: false,
          animation: 'fade'
        }} 
      />
      <Stack.Screen 
        name="(tabs)" 
        options={{
          headerShown: false,
          animation: 'fade'
        }} 
      />
      <Stack.Screen 
        name="expedicao" 
        options={{
          headerShown: false,
          title: 'Expedição',
          animation: 'slide_from_right'
        }} 
      />
      <Stack.Screen 
        name="conferencia" 
        options={{ 
          headerShown: false,
          title: 'Conferência',
          animation: 'slide_from_right'
        }} 
      />
      <Stack.Screen 
        name="estoque" 
        options={{
          headerShown: false,
          title: 'Estoque',
          animation: 'slide_from_right'
        }} 
      />
      <Stack.Screen 
        name="romaneio" 
        options={{ 
          title: 'Romaneio',
          animation: 'slide_from_right'
        }} 
      />
    </Stack>
  );
}