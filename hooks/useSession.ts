// hooks/useSession.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, logout as apiLogout, setupInactivityListener, clearInactivityTimer, setCurrentUser } from '../services/api';
import { authService } from '../services/auth';
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

  // Carregar sessão - executa apenas uma vez
  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        console.log('🔄 Carregando sessão...');
        
        const storedSession = await AsyncStorage.getItem('sankhya_session');
        
        if (storedSession && isMounted) {
          console.log('📦 Sessão encontrada no storage');
          const parsedSession = JSON.parse(storedSession);
          
          if (!parsedSession.username || !parsedSession.jsessionid || !parsedSession.idusu) {
            console.warn('⚠️ Sessão incompleta, limpando...');
            await AsyncStorage.removeItem('sankhya_session');
            if (isMounted) {
              setSession(null);
              setIsAuthenticated(false);
            }
            return;
          }
          
          setCurrentUser(parsedSession.username);
          
          const token = await authService.getBearerToken();
          const isValid = await authService.isTokenValid();
          
          console.log('🔍 Verificando token:', {
            usuario: parsedSession.username,
            tokenExiste: !!token,
            isValid: isValid
          });
          
          if (isValid && token && isMounted) {
            setSession(parsedSession);
            setIsAuthenticated(true);
            console.log(`✅ Sessão carregada com sucesso para ${parsedSession.username}`);
          } else {
            console.warn(`⚠️ Token inválido para ${parsedSession.username}, limpando...`);
            await AsyncStorage.removeItem('sankhya_session');
            if (isMounted) {
              setSession(null);
              setIsAuthenticated(false);
            }
          }
        } else {
          console.log('ℹ️ Nenhuma sessão encontrada');
          if (isMounted) {
            setSession(null);
            setIsAuthenticated(false);
          }
        }
      } catch (err) {
        console.error('❌ Erro ao carregar sessão:', err);
        if (isMounted) {
          setSession(null);
          setIsAuthenticated(false);
        }
        await AsyncStorage.removeItem('sankhya_session');
      } finally {
        if (isMounted) {
          console.log('🔄 Carregamento finalizado, definindo loading como false');
          setLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      isMounted = false;
      clearInactivityTimer();
    };
  }, []);

  // Configurar listener de inatividade quando a sessão for carregada
  useEffect(() => {
    if (!session || loading) return;

    console.log('⏰ Configurando listener de inatividade para:', session.username);

    const handleInactiveLogout = async () => {
      console.log('⏰ Logout por inatividade');
      await performLogout();
      router.replace('/login');
    };

    setupInactivityListener(handleInactiveLogout);

    return () => {
      clearInactivityTimer();
    };
  }, [session, loading]);

  const performLogout = async (): Promise<void> => {
    try {
      const currentSession = await AsyncStorage.getItem('sankhya_session');
      let username = null;
      
      if (currentSession) {
        const sessionData = JSON.parse(currentSession);
        username = sessionData.username;
      }
      
      try {
        await apiLogout();
      } catch (err) {
        console.warn('Erro no logout da API:', err);
      }
      
      if (username) {
        await authService.invalidateTokenForUser(username);
        console.log(`🗑️ Token invalidado para o usuário: ${username}`);
      } else {
        await authService.invalidateToken();
      }
      
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    } finally {
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      setIsAuthenticated(false);
      clearInactivityTimer();
    }
  };

  const login = async (username: string, password: string): Promise<void> => {
    console.log('🚀 useSession.login CHAMADO PARA:', username);
    setLoading(true);
    setError(null);

    try {
      console.log(`🔐 Iniciando login para o usuário: ${username}`);
      
      setCurrentUser(username);
      console.log(`👤 Usuário definido no AuthService: ${username}`);
      
      console.log('🔐 Chamando apiLogin...');
      const result = await apiLogin(username, password);
      console.log('✅ apiLogin retornou:', result);
      
      const newSession: SankhyaSession = {
        ...result,
        username,
        timestamp: Date.now()
      };

      if (!newSession.jsessionid || !newSession.idusu) {
        throw new Error('Dados de sessão inválidos recebidos do servidor');
      }

      setSession(newSession);
      setIsAuthenticated(true);
      await AsyncStorage.setItem('sankhya_session', JSON.stringify(newSession));
      
      console.log(`✅ Login realizado com sucesso para ${username}`);
      
    } catch (err) {
      console.error('❌ Erro no login:', err);
      
      try {
        await authService.invalidateTokenForUser(username);
      } catch (e) {
        console.error('Erro ao invalidar token:', e);
      }
      
      try {
        await AsyncStorage.removeItem('sankhya_session');
      } catch (e) {
        console.error('Erro ao remover sessão:', e);
      }
      
      setSession(null);
      setIsAuthenticated(false);
      
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
    } catch (err) {
      console.error('❌ Erro no logout:', err);
      await AsyncStorage.removeItem('sankhya_session');
      setSession(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      if (!session?.username) {
        console.error('❌ Nenhum usuário na sessão para renovar token');
        return false;
      }
      
      console.log(`🔄 Renovando token para ${session.username}...`);
      
      setCurrentUser(session.username);
      await authService.invalidateToken();
      const newToken = await authService.getBearerToken();
      const isValid = await authService.isTokenValid();
      
      if (newToken && isValid) {
        console.log(`✅ Token renovado com sucesso para ${session.username}`);
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

  const getCurrentUser = (): string | null => {
    return session?.username || null;
  };

  const checkCurrentToken = async (): Promise<boolean> => {
    if (!session?.username) return false;
    
    try {
      setCurrentUser(session.username);
      const isValid = await authService.isTokenValid();
      setIsAuthenticated(isValid);
      return isValid;
    } catch (error) {
      console.error('❌ Erro ao verificar token atual:', error);
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
    getCurrentUser,
    checkCurrentToken,
    isAuthenticated,
    hasValidToken: isAuthenticated
  };
}