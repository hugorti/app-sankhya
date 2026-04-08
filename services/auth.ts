// services/auth.ts - COM NOVO X-TOKEN

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  not_before_policy: number;
  scope: string;
}

export class AuthService {
  private static instance: AuthService;
  private tokenExpiration: number | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getBearerToken(): Promise<string | null> {
    try {
      // Verificar se temos token válido no storage
      const storedToken = await AsyncStorage.getItem('sankhya_bearer_token');
      const tokenExpiration = await AsyncStorage.getItem('sankhya_token_expiration');
      
      if (storedToken && tokenExpiration) {
        const expirationTime = parseInt(tokenExpiration);
        
        // Se o token ainda é válido (com margem de 60 segundos)
        if (Date.now() < expirationTime - 60000) {
          console.log('✅ Token válido encontrado');
          return storedToken;
        }
      }
      
      // Se não tem token ou está expirado, gerar novo
      console.log('🔄 Gerando novo token...');
      return await this.generateToken();
      
    } catch (error) {
      console.error('❌ Erro ao obter token:', error);
      return null;
    }
  }

  private async generateToken(): Promise<string | null> {
    try {
      console.log('🔐 Iniciando geração de token OAuth...');
      
      // CREDENCIAIS CORRETAS (baseadas no curl que funciona)
      const CLIENT_ID = '25a5c6d7-a3f1-4149-866b-f06b4d23cd00';
      const CLIENT_SECRET = '9aVXcCy6rtB0LMZb35rSQaDG1sMjkAI0';
      
      // 🔄 SUBSTITUA ESTE VALOR PELO NOVO X-TOKEN GERADO NO SANKHYA OM
      const X_TOKEN = '8ea22bfb-755a-4b1c-9779-c6e408e9219f'; // ← GERAR NOVO NO SANKHYA OM
      
      // Construir o body com URLSearchParams (igual ao curl)
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', CLIENT_ID);
      formData.append('client_secret', CLIENT_SECRET);
      
      // Headers exatamente como no curl
      const headers = {
        'accept': 'application/x-www-form-urlencoded',
        'content-type': 'application/x-www-form-urlencoded',
        'X-Token': X_TOKEN,
      };
      
      console.log('📤 Enviando requisição para:', 'https://api.sandbox.sankhya.com.br/authenticate');
      console.log('📋 Headers:', headers);
      console.log('📋 Body (form-data):', {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: '***' // Ocultado por segurança
      });

      const response = await axios.post<TokenResponse>(
        'https://api.sandbox.sankhya.com.br/authenticate',
        formData.toString(),
        { headers }
      );

      console.log('📥 Resposta recebida:', response.status);

      if (response.data && response.data.access_token) {
        const { access_token, expires_in } = response.data;
        
        console.log('✅ Token JWT gerado com sucesso!');
        console.log('🔑 Token:', access_token.substring(0, 50) + '...');
        console.log('⏰ Expira em:', expires_in, 'segundos');
        
        // Salvar o token e sua expiração
        await AsyncStorage.setItem('sankhya_bearer_token', access_token);
        
        // Calcular e salvar o timestamp de expiração
        const expirationTime = Date.now() + (expires_in * 1000);
        await AsyncStorage.setItem('sankhya_token_expiration', expirationTime.toString());
        
        return access_token;
      }
      
      throw new Error('Resposta inválida do servidor de autenticação');
      
    } catch (error) {
      console.error('❌ Erro detalhado ao gerar token:');
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Headers:', error.response.headers);
          console.error('Data:', error.response.data);
          
          // Mensagens de erro mais específicas baseadas no status
          if (error.response.status === 401) {
            const errorData = error.response.data as any;
            
            if (errorData.error === 'invalid_client') {
              throw new Error('Client ID ou Client Secret inválidos. Verifique as credenciais na Área do Desenvolvedor do Sankhya.');
            } else if (errorData.error === 'invalid_token') {
              throw new Error('X-Token inválido. Verifique se o token está correto e foi gerado no Sankhya Om.');
            } else if (errorData.error === 'invalid_grant') {
              throw new Error('Grant type inválido. Verifique se "client_credentials" está habilitado para esta aplicação.');
            } else {
              throw new Error(`Erro de autenticação: ${errorData.error_description || 'Credenciais inválidas'}`);
            }
          } else if (error.response.status === 403) {
            throw new Error('Acesso negado. A aplicação não tem permissão para usar este fluxo de autenticação.');
          } else if (error.response.status === 400) {
            throw new Error(`Requisição inválida: ${JSON.stringify(error.response.data)}`);
          } else {
            throw new Error(`Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
          }
        } else if (error.request) {
          console.error('Sem resposta do servidor:', error.request);
          throw new Error('Servidor de autenticação não respondeu. Verifique sua conexão com a internet.');
        } else {
          console.error('Erro na configuração:', error.message);
          throw new Error(`Erro na requisição: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  async invalidateToken(): Promise<void> {
    console.log('🗑️ Invalidando token...');
    await AsyncStorage.removeItem('sankhya_bearer_token');
    await AsyncStorage.removeItem('sankhya_token_expiration');
    this.tokenExpiration = null;
  }
  
  async isTokenValid(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem('sankhya_bearer_token');
      const expiration = await AsyncStorage.getItem('sankhya_token_expiration');
      
      if (!token || !expiration) {
        return false;
      }
      
      const expirationTime = parseInt(expiration);
      return Date.now() < expirationTime - 60000;
    } catch (error) {
      return false;
    }
  }
}