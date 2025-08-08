import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, logout as apiLogout, setupInactivityListener, clearInactivityTimer } from '../services/api';
import { useRouter } from 'expo-router';

interface SankhyaSession {
  jsessionid: string;
  idusu: string;
  callID: string;
  username: string;
  timestamp: number;
}

// hooks/useSession.ts
export function useSession() {
  const [session, setSession] = useState<SankhyaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const performLogout = async (): Promise<void> => {
    try {
      await apiLogout();
    } catch (err) {
      console.error('Erro ao fazer logout na API:', err);
    } finally {
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      clearInactivityTimer();
    }
  };

  const handleInactiveLogout = async (): Promise<void> => {
    await performLogout();
    router.replace('/login');
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedSession = await AsyncStorage.getItem('sankhya_session');
        if (storedSession) {
          const parsedSession = JSON.parse(storedSession);
          // Verifica se a sessão ainda é válida
          if (parsedSession.jsessionid && parsedSession.idusu) {
            setSession(parsedSession);
            setupInactivityListener(handleInactiveLogout);
          } else {
            await AsyncStorage.removeItem('sankhya_session');
          }
        }
      } catch (err) {
        console.error('Erro ao carregar sessão:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    return () => {
      clearInactivityTimer();
    };
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiLogin(username, password);
      
      const newSession: SankhyaSession = {
        ...result,
        username,
        timestamp: Date.now()
      };

      // Verificação adicional dos dados da sessão
      if (!newSession.jsessionid || !newSession.idusu) {
        throw new Error('Dados de sessão inválidos recebidos do servidor');
      }

      setSession(newSession);
      await AsyncStorage.setItem('sankhya_session', JSON.stringify(newSession));
      setupInactivityListener(handleInactiveLogout);
      
      // Navegação após login bem-sucedido
      router.replace('/(tabs)');
    } catch (err) {
      // Limpeza em caso de erro
      await performLogout();
      
      const errorMessage = err instanceof Error ? err.message : 'Falha no login';
      setError(errorMessage);
      
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      await performLogout();
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  return {
    session,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!session?.jsessionid
  };
}