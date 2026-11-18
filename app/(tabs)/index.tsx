// app/(tabs)/index.tsx
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../hooks/useSession';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { useEffect, useState } from 'react';
import { buscarGrupoUsuario, getCurrentApiURL } from '@/services/api';

export default function HomeScreen() {
  const router = useRouter();
  const { session, logout } = useSession();
  const [userGroup, setUserGroup] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchUserGroup = async () => {
      if (!session?.username) {
        console.log('⚠️ Nenhum usuário na sessão');
        setLoading(false);
        return;
      }

      console.log(`📍 URL em uso: ${getCurrentApiURL()}`);
      console.log(`👤 Buscando grupo para: ${session.username}`);

      try {
        const group = await buscarGrupoUsuario(session.username);
        setUserGroup(group);

        if (group !== null) {
          console.log(`✅ Grupo do usuário ${session.username}: ${group}`);
        } else {
          console.warn(`⚠️ Não foi possível encontrar o grupo para ${session.username}`);
        }
      } catch (error) {
        console.error('❌ Erro ao buscar grupo:', error);
        setUserGroup(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserGroup();
  }, [session]);

  const handleLogout = async () => {
    Alert.alert(
      'Confirmar Logout',
      'Deseja realmente sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 Iniciando logout...');
              await logout();
              console.log('✅ Logout realizado, redirecionando para login...');
              router.replace('/login');
            } catch (error) {
              console.error('❌ Erro no logout:', error);
              Alert.alert('Erro', 'Não foi possível fazer logout');
            }
          }
        }
      ]
    );
  };

  const hasExpedicaoPermission = () => {
    if (!userGroup) return false;
    const allowedGroups = [1, 6];
    return allowedGroups.includes(userGroup);
  };

  const navigateTo = (screen: keyof RootStackParamList) => {
    console.log(`🔍 Navegando para: ${screen}, Grupo: ${userGroup}`);

    if ((screen === 'expedicao' || screen === 'conferenciaList' || screen === 'separacao') && !hasExpedicaoPermission()) {
      Alert.alert('Acesso negado', '...');
      return;
    }
    router.push(`/${screen}`);
  };

  if (!session || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7E469B" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          alt="Logo"
          source={require('../../assets/images/logobranco.png')}
          style={styles.logoImage}
        />
        <View style={styles.userInfo}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="exit-outline" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.welcomeText}>{session.username}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: '#FF9800' }]}>
              <Ionicons name="cube-outline" size={24} color="white" />
            </View>
            <Text style={styles.sectionTitle}>Logística</Text>
          </View>

          {/* Linha 1: Expedição + Conferência lado a lado */}
          <View style={styles.cardsContainer}>
            <TouchableOpacity
              style={styles.cardWrapper}
              onPress={() => navigateTo('expedicao')}
            >
              <View style={[styles.card, { backgroundColor: '#FF9800' }]}>
                <Ionicons name="cube-outline" size={36} color="white" />
                <Text style={styles.cardText}>Expedição</Text>
                <Text style={styles.cardSubtext}>Gerenciar envios</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cardWrapper}
              onPress={() => navigateTo('conferenciaList')}
            >
              <View style={[styles.card, { backgroundColor: '#2196F3' }]}>
                <Ionicons name="checkmark-done-outline" size={36} color="white" />
                <Text style={styles.cardText}>Conferência</Text>
                <Text style={styles.cardSubtext}>Verificar produtos</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Linha 2: Separação — mesmo tamanho dos outros, em linha própria */}
          <View style={styles.cardsContainer}>
            <TouchableOpacity
              style={styles.cardWrapper}
              onPress={() => navigateTo('separacao')}
            >
              <View style={[styles.card, { backgroundColor: '#9C27B0' }]}>
                <Ionicons name="list-outline" size={36} color="white" />
                <Text style={styles.cardText}>Separação</Text>
                <Text style={styles.cardSubtext}>Minhas tarefas</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Sistema de Gestão</Text>
          <Text style={styles.footerText}>Copyright © Labotrat {currentYear}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    color: '#7E469B',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    paddingTop: 50,
    paddingBottom: 15,
    justifyContent: 'space-between',
    backgroundColor: '#7E469B',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  logoImage: {
    width: 120,
    height: 45,
    marginLeft: 20,
  },
  userInfo: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginRight: 20,
  },
  logoutButton: {
    padding: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  welcomeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  section: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#444',
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '48%',
    borderRadius: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginBottom: 15,
  },
  card: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
  },
  cardText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    textAlign: 'center',
  },
  cardSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#888',
  },
});