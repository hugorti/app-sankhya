import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  SafeAreaView,
  Image,
  Animated,
  Easing,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/hooks/useSession';

export default function ExploreScreen() {
  const currentDate = new Date().toLocaleDateString('pt-BR');
  const currentYear = new Date().getFullYear();
  const router = useRouter();
  const { logout } = useSession();
  const [saindo, setSaindo] = useState(false);

  // Animação para a imagem da pessoa
  const bounceValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceValue, {
          toValue: -10,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceValue, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleLogout = () => {
    if (saindo) return;

    Alert.alert(
      'Sair da conta?',
      'Você será desconectado e voltará para a tela de login. O progresso de separações não finalizadas será perdido.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaindo(true);

              // 1) Logout do hook — invalida token, chama MobileLoginSP.logout
              //    no Sankhya, remove sankhya_session e zera o estado em memória
              try {
                await logout();
              } catch (err) {
                console.warn('⚠️ Falha no logout remoto:', err);
              }

              // 2) Reset total do AsyncStorage (progresso de separação,
              //    lastUsername, ambiente, versão etc.)
              await AsyncStorage.clear();

              // 3) Vai para login substituindo a pilha
              router.replace('/login');
            } catch (err) {
              console.error('❌ Erro ao sair:', err);
              Alert.alert(
                'Erro',
                err instanceof Error
                  ? err.message
                  : 'Não foi possível sair. Tente novamente.'
              );
              setSaindo(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ImageBackground
      source={{
        uri: 'https://images.unsplash.com/photo-1620121692029-d088224ddc74?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1632&q=80',
      }}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container}>
        {/* Botão de logout */}
        <View style={styles.headerBar}>
          <View style={{ width: 44 }} />
          <TouchableOpacity
            style={styles.logoutButton}
            activeOpacity={0.8}
            disabled={saindo}
            onPress={handleLogout}
          >
            {saindo ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="white" />
                <Text style={styles.logoutText}>Sair</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>
            Descubra as funcionalidades do Sankhya
          </Text>

          {/* Card com imagem animada */}
          <View style={styles.card}>
            <Animated.Image
              source={{
                uri: 'https://images.vexels.com/content/145908/preview/computer-user-2d02f5.png',
              }}
              style={[
                styles.personImage,
                { transform: [{ translateY: bounceValue }] },
              ]}
              resizeMode="contain"
            />
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Novidades em Breve!</Text>
              <Text style={styles.cardText}>
                Estamos preparando funcionalidades incríveis para melhorar sua
                experiência.
              </Text>
            </View>
          </View>

          {/* Recursos em Destaque */}
          <View style={styles.featuresContainer}>
            <Text style={styles.sectionTitle}>Recursos em Destaque</Text>
            <View style={styles.featuresGrid}>
              <View style={styles.featureItem}>
                <View
                  style={[styles.featureIcon, { backgroundColor: '#6C63FF' }]}
                >
                  <Text style={styles.iconText}>📊</Text>
                </View>
                <Text style={styles.featureText}>Relatórios</Text>
              </View>
              <View style={styles.featureItem}>
                <View
                  style={[styles.featureIcon, { backgroundColor: '#FF6584' }]}
                >
                  <Text style={styles.iconText}>📈</Text>
                </View>
                <Text style={styles.featureText}>Análises</Text>
              </View>
              <View style={styles.featureItem}>
                <View
                  style={[styles.featureIcon, { backgroundColor: '#36D1DC' }]}
                >
                  <Text style={styles.iconText}>🔍</Text>
                </View>
                <Text style={styles.featureText}>Busca</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Desenvolvido por: Hugo Rodrigues - {currentDate}
          </Text>
          <Text style={styles.footerText}>
            Copyright © Labotrat {currentYear}
          </Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 8,
    paddingBottom: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 30,
    textAlign: 'center',
    fontWeight: '300',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  personImage: {
    width: 150,
    height: 150,
    marginBottom: 15,
  },
  cardContent: {
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D2D2D',
    marginBottom: 10,
  },
  cardText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresContainer: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    marginBottom: 15,
    textAlign: 'center',
  },
  featuresGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  featureIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 24,
  },
  featureText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  footer: {
    padding: 15,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginVertical: 2,
  },
});