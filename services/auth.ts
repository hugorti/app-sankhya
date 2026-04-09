// services/auth.ts
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

interface AuthCredentials {
  AUTH_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  X_TOKEN: string;
}

export class AuthService {
  private static instance: AuthService;
  private tokenExpiration: number | null = null;
  private currentCredentials: AuthCredentials = {
    AUTH_URL: 'https://api.sandbox.sankhya.com.br/authenticate',
    CLIENT_ID: '25a5c6d7-a3f1-4149-866b-f06b4d23cd00',
    CLIENT_SECRET: '9aVXcCy6rtB0LMZb35rSQaDG1sMjkAI0',
    X_TOKEN: '8ea22bfb-755a-4b1c-9779-c6e408e9219f',
  };

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async updateCredentials(credentials: AuthCredentials): Promise<void> {
    console.log('🔄 Atualizando credenciais do AuthService');
    this.currentCredentials = credentials;
    await this.invalidateToken(); // Forçar novo token com novas credenciais
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
      console.log(`📍 URL: ${this.currentCredentials.AUTH_URL}`);
      console.log(`🔑 Client ID: ${this.currentCredentials.CLIENT_ID}`);
      
      // Construir o body com URLSearchParams
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.currentCredentials.CLIENT_ID);
      formData.append('client_secret', this.currentCredentials.CLIENT_SECRET);
      
      // Headers
      const headers = {
        'accept': 'application/x-www-form-urlencoded',
        'content-type': 'application/x-www-form-urlencoded',
        'X-Token': this.currentCredentials.X_TOKEN,
      };
      
      console.log('📤 Enviando requisição para autenticação...');

      const response = await axios.post<TokenResponse>(
        this.currentCredentials.AUTH_URL,
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
          console.error('Data:', error.response.data);
          
          if (error.response.status === 401) {
            const errorData = error.response.data as any;
            
            if (errorData.error === 'invalid_client') {
              throw new Error('Client ID ou Client Secret inválidos para este ambiente.');
            } else if (errorData.error === 'invalid_token') {
              throw new Error('X-Token inválido para este ambiente.');
            } else {
              throw new Error(`Erro de autenticação: ${errorData.error_description || 'Credenciais inválidas'}`);
            }
          } else {
            throw new Error(`Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
          }
        } else if (error.request) {
          console.error('Sem resposta do servidor');
          throw new Error('Servidor de autenticação não respondeu. Verifique sua conexão.');
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