// app/(tabs)/index.tsx
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';

export default function HomeScreen() {
  const router = useRouter();
  const { session, logout } = useSession();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível fazer logout');
    }
  };

  const navigateTo = (screen: keyof RootStackParamList) => {
    router.push(`/${screen}`);
  };

  if (!session) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WMS</Text>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{session.username}</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="exit-outline" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Body with Cards */}
      <View style={styles.body}>
        <View style={styles.row}>
          <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#FF9800' }]}
            onPress={() => navigateTo('expedicao')}
          >
            <Ionicons name="cube-outline" size={48} color="white" />
            <Text style={styles.cardText}>Expedição</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#2196F3' }]}
            onPress={() => navigateTo('conferenciaList')}
          >
            <Ionicons name="checkmark-done-outline" size={48} color="white" />
            <Text style={styles.cardText}>Conferência</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#4CAF50' }]}
            onPress={() => navigateTo('estoque')}
          >
            <Ionicons name="archive-outline" size={48} color="white" />
            <Text style={styles.cardText}>Estoque</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#9C27B0' }]}
            onPress={() => navigateTo('romaneio')}
          >
            <Ionicons name="document-text-outline" size={48} color="white" />
            <Text style={styles.cardText}>Romaneio</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#9c27b0',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    color: 'white',
    marginRight: 15,
  },
  logoutButton: {
    padding: 5,
  },
  body: {
    flex: 1,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cardText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
  },
});