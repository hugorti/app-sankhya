// hooks/useSession.ts
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin } from '../services/api';
import { useRouter } from 'expo-router';

interface SankhyaSession {
  jsessionid: string;
  idusu: string;
  callID: string;
  username: string;
  timestamp: number;
}

export function useSession() {
  const [session, setSession] = useState<SankhyaSession | null>(null);
  const [loading, setLoading] = useState(true); // Começa como true para carregar a sessão
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedSession = await AsyncStorage.getItem('sankhya_session');
        if (storedSession) {
          const parsedSession = JSON.parse(storedSession);
          // Verifica se a sessão ainda é válida (opcional: pode adicionar tempo de expiração)
          setSession(parsedSession);
        }
      } catch (err) {
        console.error('Erro ao carregar sessão:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiLogin(username, password);
      
      const newSession = {
        ...result,
        username,
        timestamp: Date.now()
      };

      setSession(newSession);
      await AsyncStorage.setItem('sankhya_session', JSON.stringify(newSession));
      
      // Redireciona para a tela inicial após login
      router.replace('/(tabs)');
    } catch (err) {
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      setError(err instanceof Error ? err.message : 'Falha no login');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      // Redireciona para a tela de login após logout
      router.replace('/login');
    } catch (err) {
      console.error('Erro durante logout:', err);
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