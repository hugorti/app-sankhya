import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { ActivityIndicator, View } from 'react-native';
import { useEffect } from 'react';
import { setupInactivityListener, clearInactivityTimer } from '../services/api';

export default function RootLayout() {
  const { session, loading, logout } = useSession();
  const router = useRouter();

  // Handle session timeout and automatic logout
  useEffect(() => {
    if (!session || !loading) return;

    const handleInactiveLogout = async () => {
      await logout();
      router.replace('/login');
    };

    setupInactivityListener(handleInactiveLogout);

    return () => {
      clearInactivityTimer();
    };
  }, [session, loading, logout]);

  // Handle initial routing based on auth state
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* Authentication Screens */}
        <Stack.Screen 
          name="login" 
          options={{ 
            title: 'Login Sankhya',
            headerShown: false,
            animation: 'fade',
            gestureEnabled: false
          }} 
        />

        {/* Main App Tabs */}
        <Stack.Screen 
          name="(tabs)" 
          options={{
            headerShown: false,
            animation: 'fade',
            gestureEnabled: false
          }} 
        />

        {/* Feature Screens */}
        <Stack.Screen 
          name="expedicao" 
          options={{
            headerShown: false,
            title: 'Expedição',
            animation: 'slide_from_right',
            gestureEnabled: true
          }} 
        />

        <Stack.Screen 
          name="conferencia" 
          options={{ 
            headerShown: false,
            title: 'Conferência',
            animation: 'slide_from_right',
            gestureEnabled: true
          }} 
        />

        <Stack.Screen 
          name="conferenciaList" 
          options={{ 
            headerShown: false,
            title: 'Conferências',
            animation: 'slide_from_right',
            gestureEnabled: true
          }} 
        />

        <Stack.Screen 
          name="almoxarife" 
          options={{
            headerShown: false,
            title: 'Almoxarife',
            animation: 'slide_from_right',
            gestureEnabled: true
          }} 
        />

        <Stack.Screen 
          name="romaneio" 
          options={{ 
            headerShown: false,
            title: 'Romaneio',
            animation: 'slide_from_right',
            gestureEnabled: true
          }} 
        />

      </Stack>
    </GestureHandlerRootView>
  );
}