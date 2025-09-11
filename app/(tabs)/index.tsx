// app/(tabs)/index.tsx
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { useEffect, useState } from 'react';
import { queryJson } from '@/services/api';

export default function HomeScreen() {
  const router = useRouter();
  const { session, logout } = useSession();
  const [userGroup, setUserGroup] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserGroup = async () => {
      if (!session?.username) return;
      
      try {
        const result = await queryJson('DbExplorerSP.executeQuery', {
          sql: `SELECT CODGRUPO FROM TSIUSU WHERE NOMEUSU = '${session.username}'`
        });
        
        if (result.rows.length > 0) {
          setUserGroup(result.rows[0][0]);
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserGroup();
  }, [session]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível fazer logout');
    }
  };

  const hasAlmoxarifePermission = () => {
    if (!userGroup) return false;
    const allowedGroups = [1, 7, 9, 17, 18, 21, 23];
    return allowedGroups.includes(userGroup);
  };

  const hasExpedicaoPermission = () => {
    if (!userGroup) return false;
    const allowedGroups = [1, 6];
    return allowedGroups.includes(userGroup);
  };

  const navigateTo = (screen: keyof RootStackParamList) => {
    // Verifica acesso para Expedição e Conferência
    if ((screen === 'expedicao' || screen === 'conferenciaList') && !hasExpedicaoPermission()) {
      Alert.alert('Acesso negado', 'Somente usuários autorizados podem acessar esta funcionalidade');
      return;
    }
    
    // Verifica acesso para Almoxarife e Romaneio
    if ((screen === 'almoxarife' || screen === 'romaneio') && !hasAlmoxarifePermission()) {
      Alert.alert('Acesso negado', 'Somente usuários autorizados podem acessar esta funcionalidade');
      return;
    }
    
    router.push(`/${screen}`);
  };

  if (!session || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image
                  alt="Logo"
                  source={require('../../assets/images/logobranco.png')}
                  style={styles.logoImage}
          />
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
            onPress={() => navigateTo('almoxarife')}
          >
            <Ionicons name="archive-outline" size={48} color="white" />
            <Text style={styles.cardText}>Almoxarife</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#9C27B0' }]}
            onPress={() => navigateTo('romaneio')}
          >
            <Ionicons name="document-text-outline" size={48} color="white" />
            <Text style={styles.cardText}>Separação</Text>
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
    backgroundColor: '#7E469B',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  logoImage: {
    width: 100,
    height: 30,
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