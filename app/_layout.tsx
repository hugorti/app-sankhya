// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useEffect } from 'react';

export default function RootLayout() {
  const { session, loading, isAuthenticated } = useSession();
  const router = useRouter();

  // Redirecionar baseado no estado de autenticação
  useEffect(() => {
    if (!loading) {
      console.log('🔄 Estado atual:', { 
        hasSession: !!session, 
        isAuthenticated, 
        loading 
      });
      
      if (session && isAuthenticated) {
        console.log('➡️ Redirecionando para (tabs)');
        router.replace('/(tabs)');
      } else {
        console.log('➡️ Redirecionando para login');
        router.replace('/login');
      }
    }
  }, [loading, session, isAuthenticated]);

  if (loading) {
    console.log('⏳ Mostrando loading...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7E469B" />
      </View>
    );
  }

  console.log('📱 Renderizando Stack Navigator');
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expedicao" />
        <Stack.Screen name="conferencia" />
        <Stack.Screen name="conferenciaList" />
        <Stack.Screen name="almoxarife" />
        <Stack.Screen name="recebimento" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
});