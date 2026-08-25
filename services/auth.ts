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
  private currentUsername: string | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  setCurrentUser(username: string): void {
    this.currentUsername = username.toUpperCase();
    console.log(`👤 Usuário atual definido no AuthService: ${this.currentUsername}`);
  }

  private getTokenKey(): string {
    if (!this.currentUsername) {
      throw new Error('Nenhum usuário definido');
    }
    return `sankhya_bearer_token_${this.currentUsername}`;
  }

  private getExpirationKey(): string {
    if (!this.currentUsername) {
      throw new Error('Nenhum usuário definido');
    }
    return `sankhya_token_expiration_${this.currentUsername}`;
  }

  async updateCredentials(credentials: AuthCredentials): Promise<void> {
    console.log('🔄 Atualizando credenciais do AuthService');
    console.log(`📍 AUTH_URL: ${credentials.AUTH_URL}`);
    console.log(`🔑 CLIENT_ID: ${credentials.CLIENT_ID}`);
    console.log(`🔐 X_TOKEN: ${credentials.X_TOKEN}`);
    
    this.currentCredentials = credentials;
    
    // Invalidar token para forçar geração com novas credenciais
    await this.invalidateToken();
    
    console.log('✅ Credenciais atualizadas e token invalidado');
  }

  async getBearerToken(): Promise<string | null> {
    try {
      console.log('🔑 Iniciando getBearerToken...');
      console.log(`👤 Usuário atual: ${this.currentUsername || 'NÃO DEFINIDO'}`);
      
      if (!this.currentUsername) {
        console.log('⚠️ Nenhum usuário definido, tentando recuperar da sessão...');
        const session = await AsyncStorage.getItem('sankhya_session');
        if (session) {
          const { username } = JSON.parse(session);
          if (username) {
            this.currentUsername = username.toUpperCase();
            console.log(`👤 Usuário recuperado da sessão: ${this.currentUsername}`);
          }
        }
        
        if (!this.currentUsername) {
          console.log('❌ Não foi possível determinar o usuário');
          return null;
        }
      }

      const tokenKey = this.getTokenKey();
      const expirationKey = this.getExpirationKey();
      
      console.log(`🔑 Procurando token para: ${this.currentUsername}`);
      console.log(`📁 Chave do token: ${tokenKey}`);
      
      const storedToken = await AsyncStorage.getItem(tokenKey);
      const tokenExpiration = await AsyncStorage.getItem(expirationKey);
      
      console.log(`📦 Token encontrado: ${!!storedToken}`);
      console.log(`⏰ Expiração encontrada: ${!!tokenExpiration}`);
      
      if (storedToken && tokenExpiration) {
        const expirationTime = parseInt(tokenExpiration);
        const now = Date.now();
        const isExpired = now >= expirationTime - 60000;
        
        console.log(`⏰ Agora: ${new Date(now).toISOString()}`);
        console.log(`⏰ Expira em: ${new Date(expirationTime).toISOString()}`);
        console.log(`⏰ Token válido: ${!isExpired}`);
        
        if (!isExpired) {
          console.log(`✅ Token válido encontrado para ${this.currentUsername}`);
          return storedToken;
        } else {
          console.log(`⚠️ Token expirado para ${this.currentUsername}`);
        }
      }
      
      console.log(`🔄 Gerando novo token para ${this.currentUsername}...`);
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
      console.log(`🔐 X-Token: ${this.currentCredentials.X_TOKEN}`);
      console.log(`👤 Usuário: ${this.currentUsername}`);
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.currentCredentials.CLIENT_ID);
      formData.append('client_secret', this.currentCredentials.CLIENT_SECRET);
      
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

      console.log('📥 Resposta recebida, status:', response.status);

      if (response.data && response.data.access_token) {
        const { access_token, expires_in } = response.data;
        
        console.log(`✅ Token JWT gerado com sucesso para ${this.currentUsername}!`);
        console.log(`🔑 Token: ${access_token.substring(0, 50)}...`);
        console.log(`⏰ Expira em: ${expires_in} segundos`);
        
        const tokenKey = this.getTokenKey();
        const expirationKey = this.getExpirationKey();
        
        await AsyncStorage.setItem(tokenKey, access_token);
        
        const expirationTime = Date.now() + (expires_in * 1000);
        await AsyncStorage.setItem(expirationKey, expirationTime.toString());
        
        return access_token;
      }
      
      throw new Error('Resposta inválida do servidor de autenticação');
      
    } catch (error) {
      console.error('❌ Erro detalhado ao gerar token:');
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', JSON.stringify(error.response.data, null, 2));
          
          if (error.response.status === 401) {
            const errorData = error.response.data as any;
            
            if (errorData.error === 'invalid_client') {
              throw new Error(`Client ID ou Client Secret inválidos para este ambiente.\nClient ID: ${this.currentCredentials.CLIENT_ID}`);
            } else if (errorData.error === 'invalid_token') {
              throw new Error(`X-Token inválido para este ambiente.\nX-Token: ${this.currentCredentials.X_TOKEN}`);
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
    console.log(`🗑️ Invalidando token para ${this.currentUsername || 'desconhecido'}...`);
    
    if (this.currentUsername) {
      const tokenKey = this.getTokenKey();
      const expirationKey = this.getExpirationKey();
      
      await AsyncStorage.removeItem(tokenKey);
      await AsyncStorage.removeItem(expirationKey);
    } else {
      console.log('⚠️ Usuário não definido, limpando todos os tokens...');
      const allKeys = await AsyncStorage.getAllKeys();
      const tokenKeys = allKeys.filter(key => 
        key.startsWith('sankhya_bearer_token_') || 
        key.startsWith('sankhya_token_expiration_')
      );
      await AsyncStorage.multiRemove(tokenKeys);
    }
    
    this.tokenExpiration = null;
  }

  async invalidateTokenForUser(username: string): Promise<void> {
    const user = username.toUpperCase();
    const tokenKey = `sankhya_bearer_token_${user}`;
    const expirationKey = `sankhya_token_expiration_${user}`;
    
    await AsyncStorage.removeItem(tokenKey);
    await AsyncStorage.removeItem(expirationKey);
    
    if (this.currentUsername === user) {
      this.tokenExpiration = null;
    }
    
    console.log(`🗑️ Token invalidado para o usuário: ${user}`);
  }

  async clearAllUserTokens(): Promise<void> {
    console.log('🗑️ Limpando tokens de todos os usuários...');
    const allKeys = await AsyncStorage.getAllKeys();
    const tokenKeys = allKeys.filter(key => 
      key.startsWith('sankhya_bearer_token_') || 
      key.startsWith('sankhya_token_expiration_')
    );
    await AsyncStorage.multiRemove(tokenKeys);
    this.tokenExpiration = null;
    this.currentUsername = null;
  }
  
  async isTokenValid(): Promise<boolean> {
    try {
      if (!this.currentUsername) {
        return false;
      }
      
      const tokenKey = this.getTokenKey();
      const expirationKey = this.getExpirationKey();
      
      const token = await AsyncStorage.getItem(tokenKey);
      const expiration = await AsyncStorage.getItem(expirationKey);
      
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

export const authService = AuthService.getInstance();