// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

export default function RootLayout() {
  const { loading } = useSession();

  // ⏳ Só mostra loading enquanto a sessão inicial está sendo carregada do AsyncStorage.
  // NÃO redireciona aqui — o login.tsx e o (tabs)/index.tsx cuidam disso.
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7E469B" />
      </View>
    );
  }

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