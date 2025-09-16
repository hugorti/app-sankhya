// app/(tabs)/index.tsx
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
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

   const currentYear = new Date().getFullYear();

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
        console.error('Erro ao buscar grupo do usuário:', error);
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
    if ((screen === 'almoxarife' || screen === 'recebimento') && !hasAlmoxarifePermission()) {
      Alert.alert('Acesso negado', 'Somente usuários autorizados podem acessar esta funcionalidade');
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
      {/* Header */}
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

      {/* Conteúdo principal com scroll */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        
        {/* Seção Logística */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: '#FF9800' }]}>
              <Ionicons name="cube-outline" size={24} color="white" />
            </View>
            <Text style={styles.sectionTitle}>Logística</Text>
          </View>
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
        </View>

        {/* Seção Almoxarife */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: '#4CAF50' }]}>
              <Ionicons name="archive-outline" size={24} color="white" />
            </View>
            <Text style={styles.sectionTitle}>Almoxarife</Text>
          </View>
          <View style={styles.cardsContainer}>
            <TouchableOpacity 
              style={styles.cardWrapper}
              onPress={() => navigateTo('almoxarife')}
            >
              <View style={[styles.card, { backgroundColor: '#4CAF50' }]}>
                <Ionicons name="archive-outline" size={36} color="white" />
                <Text style={styles.cardText}>Separação</Text>
                <Text style={styles.cardSubtext}>Controle de estoque</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.cardWrapper}
              onPress={() => navigateTo('recebimento')}
            >
              <View style={[styles.card, { backgroundColor: '#9C27B0' }]}>
                <Ionicons name="document-text-outline" size={36} color="white" />
                <Text style={styles.cardText}>Recebimento</Text>
                <Text style={styles.cardSubtext}>Entrada de produtos</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>Sistema de Gestão</Text>
          <Text style={styles.footerText}>By: Hugo Rodrigues</Text>
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
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
  },
  userName: {
    fontSize: 14,
    color: 'white',
    marginLeft: 5,
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