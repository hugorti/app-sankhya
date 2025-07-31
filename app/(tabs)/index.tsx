// app/(tabs)/index.tsx
import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSession } from '../../hooks/useSession';

export default function HomeScreen() {
  const router = useRouter();
  const { session, logout } = useSession();
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    setIsWeb(typeof window !== 'undefined');
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      // O redirecionamento é tratado pelo hook useSession
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível fazer logout');
    }
  };

  if (!session) {
    return null; // O redirecionamento é tratado pelo layout
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo ao Sankhya App</Text>
      
      <View style={styles.sessionInfo}>
        <Text>ID do Usuário: {session.idusu}</Text>
        <Text>Usuário: {session.username}</Text>
        <Text>Plataforma: {isWeb ? 'Web' : 'Mobile'}</Text>
      </View>

      <Button 
        title="Sair" 
        onPress={handleLogout}
        color="#FF3B30"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  sessionInfo: {
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
});