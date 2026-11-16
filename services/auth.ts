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
  private currentCredentials: AuthCredentials = {
    AUTH_URL: 'https://api.sandbox.sankhya.com.br/authenticate',
    CLIENT_ID: '25a5c6d7-a3f1-4149-866b-f06b4d23cd00',
    CLIENT_SECRET: '9aVXcCy6rtB0LMZb35rSQaDG1sMjkAI0',
    X_TOKEN: 'bca825bd-d9df-44a5-9881-ee76a8b02bd7',
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
    if (!this.currentUsername) throw new Error('Nenhum usuário definido');
    return `sankhya_bearer_token_${this.currentUsername}`;
  }

  private getExpirationKey(): string {
    if (!this.currentUsername) throw new Error('Nenhum usuário definido');
    return `sankhya_token_expiration_${this.currentUsername}`;
  }

  async updateCredentials(credentials: AuthCredentials): Promise<void> {
    console.log('🔄 Atualizando credenciais OAuth do AuthService');
    console.log(`📍 AUTH_URL: ${credentials.AUTH_URL}`);
    console.log(`🔑 CLIENT_ID: ${credentials.CLIENT_ID}`);
    console.log(`🔐 X_TOKEN: ${credentials.X_TOKEN}`);

    this.currentCredentials = credentials;

    // Sempre invalida o token ao trocar credenciais
    await this.invalidateToken();

    console.log('✅ Credenciais atualizadas e token invalidado');
  }

  /**
   * Obtém o Bearer Token via OAuth 2.0 (/authenticate).
   * @param forceRefresh Se true, ignora o cache e força a geração de um novo token.
   */
  async getBearerToken(forceRefresh = false): Promise<string | null> {
    try {
      console.log('🔑 Iniciando getBearerToken...');
      console.log(`👤 Usuário atual: ${this.currentUsername || 'NÃO DEFINIDO'}`);
      console.log(`🔄 Force refresh: ${forceRefresh}`);

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

      if (!forceRefresh) {
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
          }
          console.log(`⚠️ Token expirado para ${this.currentUsername}`);
        }
      } else {
        console.log('♻️ Force refresh: ignorando cache e regenerando token');
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
      console.log('🔐 Iniciando geração de token OAuth via /authenticate...');
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

      console.log('📤 Enviando requisição de autenticação...');

      const response = await axios.post<TokenResponse>(
        this.currentCredentials.AUTH_URL,
        formData.toString(),
        { headers }
      );

      console.log('📥 Resposta recebida, status:', response.status);
      console.log('📥 Body:', JSON.stringify(response.data, null, 2));

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
              throw new Error(`Client ID ou Client Secret inválidos.\nClient ID: ${this.currentCredentials.CLIENT_ID}`);
            } else if (errorData.error === 'invalid_token') {
              throw new Error(`X-Token inválido.\nX-Token: ${this.currentCredentials.X_TOKEN}`);
            } else {
              throw new Error(`Erro de autenticação: ${errorData.error_description || 'Credenciais inválidas'}`);
            }
          }
          throw new Error(`Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          throw new Error('Servidor de autenticação não respondeu. Verifique sua conexão.');
        } else {
          throw new Error(`Erro na requisição: ${error.message}`);
        }
      }
      throw error;
    }
  }

  async invalidateToken(): Promise<void> {
    console.log(`🗑️ Invalidando token para ${this.currentUsername || 'desconhecido'}...`);

    if (this.currentUsername) {
      await AsyncStorage.removeItem(this.getTokenKey());
      await AsyncStorage.removeItem(this.getExpirationKey());
    } else {
      const allKeys = await AsyncStorage.getAllKeys();
      const tokenKeys = allKeys.filter(
        (key) =>
          key.startsWith('sankhya_bearer_token_') ||
          key.startsWith('sankhya_token_expiration_')
      );
      await AsyncStorage.multiRemove(tokenKeys);
    }
  }

  async invalidateTokenForUser(username: string): Promise<void> {
    const user = username.toUpperCase();
    await AsyncStorage.removeItem(`sankhya_bearer_token_${user}`);
    await AsyncStorage.removeItem(`sankhya_token_expiration_${user}`);
    console.log(`🗑️ Token invalidado para o usuário: ${user}`);
  }

  async clearAllUserTokens(): Promise<void> {
    const allKeys = await AsyncStorage.getAllKeys();
    const tokenKeys = allKeys.filter(
      (key) =>
        key.startsWith('sankhya_bearer_token_') ||
        key.startsWith('sankhya_token_expiration_')
    );
    await AsyncStorage.multiRemove(tokenKeys);
    this.currentUsername = null;
  }

  async isTokenValid(): Promise<boolean> {
    try {
      if (!this.currentUsername) return false;
      const token = await AsyncStorage.getItem(this.getTokenKey());
      const expiration = await AsyncStorage.getItem(this.getExpirationKey());
      if (!token || !expiration) return false;
      return Date.now() < parseInt(expiration) - 60000;
    } catch {
      return false;
    }
  }
}

export const authService = AuthService.getInstance();