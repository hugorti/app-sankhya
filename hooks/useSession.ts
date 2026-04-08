// hooks/useSession.ts
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, logout as apiLogout, setupInactivityListener, clearInactivityTimer } from '../services/api';
import { AuthService } from '../services/auth';
import { useRouter } from 'expo-router';

interface SankhyaSession {
  jsessionid: string;
  idusu: string;
  callID: string;
  username: string;
  codusu?: string;
  timestamp: number;
}

export function useSession() {
  const [session, setSession] = useState<SankhyaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  
  const authService = AuthService.getInstance();

  // Função para verificar se o Bearer Token é válido
  const checkBearerToken = async (): Promise<boolean> => {
    try {
      const token = await authService.getBearerToken();
      const isValid = await authService.isTokenValid();
      
      console.log('🔍 Verificando Bearer Token:', {
        tokenExiste: !!token,
        isValid: isValid
      });
      
      return isValid && !!token;
    } catch (error) {
      console.error('❌ Erro ao verificar Bearer Token:', error);
      return false;
    }
  };

  const performLogout = async (): Promise<void> => {
    try {
      await apiLogout();
      await authService.invalidateToken(); // Importante: invalidar o Bearer Token
    } catch (err) {
      console.error('Erro ao fazer logout na API:', err);
    } finally {
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      setIsAuthenticated(false);
      clearInactivityTimer();
    }
  };

  const handleInactiveLogout = async (): Promise<void> => {
    console.log('⏰ Logout por inatividade');
    await performLogout();
    router.replace('/login');
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        // 1. Verificar se temos Bearer Token válido
        const hasValidToken = await checkBearerToken();
        
        // 2. Carregar sessão do storage
        const storedSession = await AsyncStorage.getItem('sankhya_session');
        
        if (storedSession && hasValidToken) {
          const parsedSession = JSON.parse(storedSession);
          
          // Verifica se a sessão ainda é válida
          if (parsedSession.jsessionid && parsedSession.idusu) {
            setSession(parsedSession);
            setIsAuthenticated(true);
            setupInactivityListener(handleInactiveLogout);
            console.log('✅ Sessão carregada com sucesso, Bearer Token válido');
          } else {
            console.warn('⚠️ Sessão inválida, limpando...');
            await performLogout();
          }
        } else {
          console.log('ℹ️ Nenhuma sessão válida encontrada');
          if (!hasValidToken) {
            await authService.invalidateToken();
          }
          setSession(null);
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Erro ao carregar sessão:', err);
        setSession(null);
        setIsAuthenticated(false);
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
      // 1. Primeiro, garantir que temos um Bearer Token válido
      console.log('🔐 Verificando Bearer Token antes do login...');
      const bearerToken = await authService.getBearerToken();
      
      if (!bearerToken) {
        throw new Error('Não foi possível obter token de autenticação');
      }
      
      console.log('✅ Bearer Token obtido com sucesso');
      
      // 2. Fazer login na API do Sankhya (isso retorna o jsessionid)
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

      // 3. Salvar sessão
      setSession(newSession);
      setIsAuthenticated(true);
      await AsyncStorage.setItem('sankhya_session', JSON.stringify(newSession));
      setupInactivityListener(handleInactiveLogout);
      
      console.log('✅ Login realizado com sucesso. Autenticado:', true);
      
      // Navegação após login bem-sucedido
      router.replace('/(tabs)');
    } catch (err) {
      // Limpeza em caso de erro
      console.error('❌ Erro no login:', err);
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

  // Função para renovar o token se necessário
  const refreshToken = async (): Promise<boolean> => {
    try {
      console.log('🔄 Renovando token manualmente...');
      await authService.invalidateToken();
      const newToken = await authService.getBearerToken();
      const isValid = await authService.isTokenValid();
      
      if (newToken && isValid) {
        console.log('✅ Token renovado com sucesso');
        setIsAuthenticated(true);
        return true;
      } else {
        console.error('❌ Falha ao renovar token');
        setIsAuthenticated(false);
        return false;
      }
    } catch (error) {
      console.error('❌ Erro ao renovar token:', error);
      setIsAuthenticated(false);
      return false;
    }
  };

  return {
    session,
    loading,
    error,
    login,
    logout,
    refreshToken,
    isAuthenticated, // Agora reflete o status do Bearer Token
    hasValidToken: isAuthenticated // Alias para clareza
  };
}