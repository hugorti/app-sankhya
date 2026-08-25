// services/api.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Buffer } from 'buffer';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { authService } from './auth';

// ==================== CONFIGURAÇÕES DE AMBIENTE ====================
export type EnvironmentType = 'TEST' | 'PRODUCTION';

interface EnvironmentConfig {
  name: string;
  BASE_URL: string;
  DEFAULT_IP: string;
  DEFAULT_PORT: string;
  AUTH_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  X_TOKEN: string;
}

export const ENVIRONMENTS: Record<EnvironmentType, EnvironmentConfig> = {
  TEST: {
    name: 'Ambiente Teste',
    BASE_URL: 'https://api.sandbox.sankhya.com.br/gateway/v1/mge/',
    DEFAULT_IP: '',
    DEFAULT_PORT: '',
    AUTH_URL: 'https://api.sandbox.sankhya.com.br/authenticate',
    CLIENT_ID: '25a5c6d7-a3f1-4149-866b-f06b4d23cd00',
    CLIENT_SECRET: '9aVXcCy6rtB0LMZb35rSQaDG1sMjkAI0',
    X_TOKEN: '8ea22bfb-755a-4b1c-9779-c6e408e9219f',
  },
  PRODUCTION: {
    name: 'Ambiente Produção',
    BASE_URL: 'https://api.sankhya.com.br/gateway/v1/mge/',
    DEFAULT_IP: '',
    DEFAULT_PORT: '',
    AUTH_URL: 'https://api.sankhya.com.br/authenticate',
    CLIENT_ID: '3112542a-4a20-4e08-92a2-298649f74911',
    CLIENT_SECRET: 'lvzGUmX7LOB5X60XVo22Sr9g2ph3GRS9',
    X_TOKEN: 'fa55d0c2-c607-4ac8-8f4f-c4d4ff7576cf',
  }
};

let currentEnvironment: EnvironmentType = 'TEST';

const SERVER_URL_KEY = 'saved_server_url';
const ENVIRONMENT_KEY = 'selected_environment';
const DEFAULT_IP = '';
const DEFAULT_PORT = '';
const DEFAULT_URL = `${DEFAULT_IP}:${DEFAULT_PORT}`;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

let currentBaseURL = `http://${DEFAULT_URL}/mge/`;
let configuredBaseURL: string | null = null;

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

interface LoginResponse {
  jsessionid: string;
  idusu: string;
  callID: string;
  transactionId: string;
}

let inactivityTimer: number | null = null;
let lastActivityTime: number | null = null;
let onInactiveCallback: (() => Promise<void>) | null = null;
let appStateSubscription: { remove: () => void } | null = null;

let loginApi: AxiosInstance = axios.create({
  baseURL: currentBaseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/xml; charset=ISO-8859-1',
    'Accept': 'application/xml'
  }
});

let queryApi: AxiosInstance = axios.create({
  baseURL: ENVIRONMENTS.TEST.BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// ==================== FUNÇÕES DE GERENCIAMENTO DE AMBIENTE ====================

export const getCurrentEnvironmentConfig = (): EnvironmentConfig => {
  return ENVIRONMENTS[currentEnvironment];
};

export const getCurrentEnvironment = (): EnvironmentType => {
  return currentEnvironment;
};

export const getCurrentApiURL = (): string => {
  return queryApi.defaults.baseURL || 'URL não configurada';
};

export const getConfigDetails = (): { environment: EnvironmentType; url: string; isManual: boolean } => {
  return {
    environment: currentEnvironment,
    url: queryApi.defaults.baseURL || 'URL não configurada',
    isManual: configuredBaseURL !== null
  };
};

// services/api.ts - Substituir estas funções

export const setEnvironment = async (environment: EnvironmentType): Promise<void> => {
  try {
    console.log(`🔄 Mudando para ambiente: ${environment}`);
    
    currentEnvironment = environment;
    await AsyncStorage.setItem(ENVIRONMENT_KEY, environment);
    
    const config = ENVIRONMENTS[environment];
    
    // ATUALIZAR CREDENCIAIS PRIMEIRO
    await updateAuthCredentials(config);
    
    // Depois atualizar a URL
    const baseURL = config.BASE_URL;
    queryApi.defaults.baseURL = baseURL;
    configuredBaseURL = null;
    currentBaseURL = baseURL;
    
    recreateLoginApiInstance(baseURL);
    
    // Invalidar token antigo para forçar geração com novas credenciais
    await authService.invalidateToken();
    
    console.log(`✅ Ambiente alterado para: ${config.name}`);
    console.log(`📍 URL em uso: ${queryApi.defaults.baseURL}`);
    console.log(`🔑 Credenciais atualizadas para: ${config.AUTH_URL}`);
    
  } catch (error) {
    console.error('❌ Erro ao salvar ambiente:', error);
    throw error;
  }
};

const updateAuthCredentials = async (config: EnvironmentConfig): Promise<void> => {
  try {
    console.log('🔄 Atualizando credenciais do AuthService para:', config.name);
    console.log(`📍 AUTH_URL: ${config.AUTH_URL}`);
    console.log(`🔑 CLIENT_ID: ${config.CLIENT_ID}`);
    console.log(`🔐 X_TOKEN: ${config.X_TOKEN}`);
    
    await authService.updateCredentials({
      AUTH_URL: config.AUTH_URL,
      CLIENT_ID: config.CLIENT_ID,
      CLIENT_SECRET: config.CLIENT_SECRET,
      X_TOKEN: config.X_TOKEN
    });
    
    // Invalidar token para forçar nova geração com as novas credenciais
    await authService.invalidateToken();
    
    console.log('✅ Credenciais atualizadas com sucesso');
  } catch (error) {
    console.error('❌ Erro ao atualizar credenciais:', error);
    throw error;
  }
};

export const loadSavedEnvironment = async (): Promise<EnvironmentType> => {
  try {
    const saved = await AsyncStorage.getItem(ENVIRONMENT_KEY);
    if (saved === 'TEST' || saved === 'PRODUCTION') {
      currentEnvironment = saved;
      const config = ENVIRONMENTS[currentEnvironment];
      
      // ATUALIZAR CREDENCIAIS PRIMEIRO
      await updateAuthCredentials(config);
      
      const baseURL = config.BASE_URL;
      queryApi.defaults.baseURL = baseURL;
      configuredBaseURL = null;
      currentBaseURL = baseURL;
      
      console.log(`📌 Ambiente carregado: ${config.name}`);
      console.log(`📍 URL do ambiente: ${baseURL}`);
      return currentEnvironment;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar ambiente:', error);
  }
  return 'TEST';
};

// ==================== FUNÇÕES DE USUÁRIO ====================

export const setCurrentUser = (username: string): void => {
  authService.setCurrentUser(username);
  console.log(`👤 Usuário definido na API: ${username}`);
};

// ==================== FUNÇÕES DE INATIVIDADE ====================

export const setupInactivityListener = (callback: () => Promise<void>) => {
  onInactiveCallback = async () => {
    try {
      await logout(true);
      await callback();
    } catch (error) {
      await AsyncStorage.removeItem('sankhya_session');
      await callback();
    }
  };
  
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  lastActivityTime = Date.now();

  appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      if (lastActivityTime) {
        const inactiveTime = Date.now() - lastActivityTime;
        if (inactiveTime >= INACTIVITY_TIMEOUT) {
          await callback();
        } else {
          lastActivityTime = Date.now();
          resetInactivityTimer();
        }
      }
    } else {
      clearInactivityTimer();
    }
  });

  resetInactivityTimer();
};

export const registerUserActivity = () => {
  lastActivityTime = Date.now();
  resetInactivityTimer();
};

export const resetInactivityTimer = () => {
  clearInactivityTimer();
  
  if (onInactiveCallback) {
    inactivityTimer = setTimeout(async () => {
      await onInactiveCallback!();
    }, INACTIVITY_TIMEOUT) as unknown as number;
  }
  
  lastActivityTime = Date.now();
};

export const clearInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
};

// ==================== FUNÇÕES DE CONFIGURAÇÃO DE URL ====================

const formatServerUrl = (ipPort: string): string => {
  ipPort = ipPort.replace(/^https?:\/\//, '');
  let [ip, port] = ipPort.split(':');
  
  ip = ip.replace(/\/+$/, '').trim();
  port = (port || DEFAULT_PORT).replace(/\/+$/, '').trim();
  
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-zA-Z0-9\-\.]+$/.test(ip)) {
    throw new Error('Formato de IP inválido');
  }
  
  if (!/^\d+$/.test(port)) {
    throw new Error('Porta inválida');
  }

  return `http://${ip}:${port}/mge/`;
};

export const setManualURL = async (ipPort: string): Promise<boolean> => {
  try {
    const formattedUrl = formatServerUrl(ipPort);
    
    console.log(`🔧 Testando conexão com: ${formattedUrl}`);
    await axios.get(formattedUrl, { timeout: 5000 });
    
    configuredBaseURL = formattedUrl;
    currentBaseURL = formattedUrl;
    
    recreateLoginApiInstance(configuredBaseURL);
    queryApi.defaults.baseURL = configuredBaseURL;
    
    const cleanIpPort = ipPort.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanIpPort);
    
    console.log(`✅ URL manual configurada: ${configuredBaseURL}`);
    console.log(`📍 Query API agora usa: ${queryApi.defaults.baseURL}`);
    return true;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) 
        ? 'Servidor não respondendo. Verifique o endereço e conexão.'
        : error instanceof Error 
          ? error.message 
          : 'Erro desconhecido ao configurar URL'
    );
  }
};

export const resetToEnvironmentURL = (): void => {
  const config = ENVIRONMENTS[currentEnvironment];
  const baseURL = config.BASE_URL;
  queryApi.defaults.baseURL = baseURL;
  configuredBaseURL = null;
  currentBaseURL = baseURL;
  recreateLoginApiInstance(baseURL);
  
  console.log(`🔄 Resetado para URL do ambiente: ${baseURL}`);
};

export const setBaseURL = async (ipPort: string): Promise<boolean> => {
  return await setManualURL(ipPort);
};

export const initializeAPI = async (): Promise<void> => {
  try {
    await loadSavedEnvironment();
    
    const config = ENVIRONMENTS[currentEnvironment];
    queryApi.defaults.baseURL = config.BASE_URL;
    console.log(`✅ API inicializada com URL do ambiente: ${config.BASE_URL}`);
    
    const session = await AsyncStorage.getItem('sankhya_session');
    if (session) {
      const sessionData = JSON.parse(session);
      if (sessionData.username) {
        setCurrentUser(sessionData.username);
        console.log('👤 Usuário recuperado da sessão na inicialização');
      }
    }
    
    const bearerToken = await authService.getBearerToken();
    if (bearerToken) {
      console.log('✅ Bearer token encontrado, API pronta');
    }
  } catch (error) {
    console.error('Failed to initialize API:', error);
    throw error;
  }
};

const recreateLoginApiInstance = (baseUrl: string) => {
  loginApi = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/xml; charset=ISO-8859-1',
      'Accept': 'application/xml'
    }
  });
  configureLoginInterceptors();
};

// ==================== INTERCEPTORS ====================

const configureLoginInterceptors = () => {
  loginApi.interceptors.request.use(async (config) => {
    try {
      const bearerToken = await authService.getBearerToken();
      
      if (bearerToken) {
        config.headers.Authorization = `Bearer ${bearerToken}`;
      } else {
        console.warn(`⚠️ Nenhum token disponível para: ${config.url}`);
      }
      
      const session = await AsyncStorage.getItem('sankhya_session');
      if (session) {
        const { jsessionid } = JSON.parse(session);
        if (jsessionid) {
          config.headers.Cookie = `JSESSIONID=${jsessionid}`;
        }
      }
      
      resetInactivityTimer();
      return config;
    } catch (error) {
      console.error('❌ Erro no interceptor:', error);
      return config;
    }
  });

  loginApi.interceptors.response.use(
    (response) => {
      resetInactivityTimer();
      return response;
    },
    async (error: AxiosError) => {
      if (error.config?.url?.includes('MobileLoginSP.logout')) {
        return Promise.reject(error);
      }

      if (error.response?.status === 401) {
        console.log('🔐 Token expirado, tentando renovar...');
        
        try {
          await authService.invalidateToken();
          const newToken = await authService.getBearerToken();
          
          if (newToken && error.config) {
            console.log('✅ Token renovado, retentando requisição');
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return loginApi(error.config);
          }
        } catch (refreshError) {
          console.error('❌ Falha ao renovar token:', refreshError);
          await AsyncStorage.removeItem('sankhya_session');
          await authService.invalidateToken();
        }
      }
      
      if (error.response?.data && typeof error.response.data === 'string') {
        if (error.response.data.includes('Bearer Token')) {
          console.error('❌ Erro: Header token deve conter um Bearer Token');
          await authService.invalidateToken();
          const newToken = await authService.getBearerToken();
          if (newToken && error.config) {
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return loginApi(error.config);
          }
        }
      }
      
      if (!error.response) {
        if (error.code === 'ERR_NETWORK') {
          return Promise.reject(new Error('Erro de conexão. Verifique sua internet.'));
        }
        throw new Error('Erro de comunicação com o servidor');
      }
      
      return Promise.reject(error);
    }
  );
};

const configureQueryInterceptors = () => {
  queryApi.interceptors.request.use(async (config) => {
    try {
      const bearerToken = await authService.getBearerToken();
      
      if (bearerToken) {
        config.headers.Authorization = `Bearer ${bearerToken}`;
      } else {
        console.warn(`⚠️ Nenhum token disponível para consulta: ${config.url}`);
      }
      
      resetInactivityTimer();
      return config;
    } catch (error) {
      console.error('❌ Erro no interceptor de consulta:', error);
      return config;
    }
  });

  queryApi.interceptors.response.use(
    (response) => {
      resetInactivityTimer();
      return response;
    },
    async (error: AxiosError) => {
      if (error.response?.status === 401) {
        console.log('🔐 Token expirado na consulta, tentando renovar...');
        
        try {
          await authService.invalidateToken();
          const newToken = await authService.getBearerToken();
          
          if (newToken && error.config) {
            console.log('✅ Token renovado, retentando consulta');
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return queryApi(error.config);
          }
        } catch (refreshError) {
          console.error('❌ Falha ao renovar token na consulta:', refreshError);
        }
      }
      
      if (!error.response) {
        if (error.code === 'ERR_NETWORK') {
          return Promise.reject(new Error('Erro de conexão. Verifique sua internet.'));
        }
        throw new Error('Erro de comunicação com o servidor');
      }
      
      return Promise.reject(error);
    }
  );
};

configureLoginInterceptors();
configureQueryInterceptors();

// ==================== FUNÇÕES DE LOGIN/LOGOUT ====================

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  console.log('🚀 INICIANDO LOGIN PARA:', username);
  
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="MobileLoginSP.login">
  <requestBody>
    <NOMUSU>${escapeXml(username)}</NOMUSU>
    <INTERNO>${escapeXml(password)}</INTERNO>
  </requestBody>
</serviceRequest>`;

  try {
    clearInactivityTimer();
    
    console.log('👤 DEFININDO USUÁRIO NO AUTH SERVICE:', username);
    setCurrentUser(username);
    
    console.log('🔐 GERANDO TOKEN PARA:', username);
    const bearerToken = await authService.getBearerToken();
    console.log('🔐 TOKEN GERADO:', bearerToken ? `${bearerToken.substring(0, 50)}...` : 'NULO');
    
    if (!bearerToken) {
      throw new Error('Não foi possível obter token de autenticação');
    }
    
    console.log(`📍 URL de login: ${loginApi.defaults.baseURL}`);
    
    const response = await loginApi.post(
      'services.sbr?serviceName=MobileLoginSP.login',
      xmlRequest,
      { 
        responseType: 'text',
        transformResponse: [(data) => {
          if (!data || typeof data !== 'string') {
            throw new Error('Resposta vazia do servidor');
          }
          return data;
        }],
        headers: {
          'Authorization': `Bearer ${bearerToken}`
        }
      }
    );

    if (typeof response.data !== 'string') {
      throw new Error('Resposta inválida do servidor: não é texto');
    }

    const result = parser.parse(response.data);

    if (!result.serviceResponse) {
      throw new Error('Estrutura de resposta inválida');
    }

    if (result.serviceResponse['@_status'] !== "1") {
      const errorMsg = result.serviceResponse?.statusMessage 
        ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
        : 'Credenciais inválidas ou serviço indisponível';
      throw new Error(errorMsg);
    }

    if (!result.serviceResponse.responseBody || 
        !result.serviceResponse.responseBody.jsessionid ||
        !result.serviceResponse.responseBody.idusu) {
      throw new Error('Dados de sessão incompletos na resposta');
    }

    const transactionId = result.serviceResponse['@_transactionId'] || '';
    
    const sessionData: LoginResponse = {
      jsessionid: result.serviceResponse.responseBody.jsessionid,
      idusu: result.serviceResponse.responseBody.idusu.trim(),
      callID: result.serviceResponse.responseBody.callID || '',
      transactionId: transactionId
    };

    await AsyncStorage.setItem('sankhya_session', JSON.stringify({
      ...sessionData,
      username,
      timestamp: Date.now()
    }));
    
    setupInactivityListener(async () => {
      console.log('Sessão expirada por inatividade');
    });

    console.log('✅ Login realizado com sucesso. TransactionId:', transactionId);
    return sessionData;

  } catch (error) {
    console.error('❌ Erro no login:', error);
    await authService.invalidateToken();
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido durante login'
    );
  }
};

export const logout = async (isAutoLogout = false): Promise<void> => {
  try {
    clearInactivityTimer();
    
    const session = await AsyncStorage.getItem('sankhya_session');
    let username = null;
    if (session) {
      const sessionData = JSON.parse(session);
      username = sessionData.username;
    }
    
    if (username) {
      await authService.invalidateTokenForUser(username);
    } else {
      await authService.invalidateToken();
    }
    
    if (isAutoLogout) {
      await Promise.race([
        loginApi.post('services.sbr?serviceName=MobileLoginSP.logout'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
    } else {
      await loginApi.post('services.sbr?serviceName=MobileLoginSP.logout');
    }
  } catch (error) {
    if (!isAutoLogout || 
        (axios.isAxiosError(error) && error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK')) {
      console.warn('Logout error:', error);
    }
  } finally {
    await AsyncStorage.removeItem('sankhya_session');
  }
};

// ==================== FUNÇÕES DE CONSULTA ====================

export const queryJson = async (serviceName: string, requestBody: any): Promise<any> => {
  try {
    const bearerToken = await authService.getBearerToken();
    
    if (!bearerToken) {
      throw new Error('Token de autenticação não encontrado');
    }
    
    const payload = {
      serviceName: serviceName,
      requestBody: requestBody
    };
    
    console.log(`📤 Enviando requisição para: ${serviceName}`);
    console.log(`📍 URL base: ${queryApi.defaults.baseURL}`);
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    
    const response = await queryApi.post(
      `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=json`,
      payload,
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`
        } 
      }
    );

    console.log('📥 Resposta recebida, status:', response.status);
    
    if (response.data && response.data.status !== undefined) {
      if (response.data.status !== "1" && response.data.status !== 1) {
        const errorMsg = response.data.statusMessage || 'Erro na requisição';
        console.error('❌ Erro na resposta:', errorMsg);
        throw new Error(errorMsg);
      }
    }

    return response.data?.responseBody || response.data;
    
  } catch (error) {
    console.error('❌ JSON query error:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('📋 Detalhes do erro:', error.response.data);
    }
    throw new Error(
      axios.isAxiosError(error)
        ? `Erro de conexão: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido na consulta'
    );
  }
};

export const executeQuery = async (sql: string): Promise<any> => {
  try {
    console.log('🔍 Executando SQL no servidor:', getCurrentApiURL());
    console.log('📝 SQL:', sql);
    
    const requestBody = {
      sql: sql
    };
    
    const result = await queryJson('DbExplorerSP.executeQuery', requestBody);
    
    console.log('✅ Query executada com sucesso');
    return result;
    
  } catch (error) {
    console.error('❌ Erro ao executar query:', error);
    throw error;
  }
};

// ==================== FUNÇÃO PARA BUSCAR GRUPO DO USUÁRIO ====================

export const buscarGrupoUsuario = async (username: string): Promise<number | null> => {
  try {
    console.log(`🔍 Buscando grupo do usuário: "${username}"`);
    console.log(`📍 URL em uso: ${getCurrentApiURL()}`);
    
    // TENTATIVA 1: Busca exata
    let sql = `SELECT CODGRUPO FROM TSIUSU WHERE NOMEUSU = '${username}'`;
    console.log(`📝 SQL 1: ${sql}`);
    let result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (busca exata): ${group}`);
      return group;
    }
    
    // TENTATIVA 2: Busca com UPPER
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE UPPER(NOMEUSU) = UPPER('${username}')`;
    console.log(`📝 SQL 2: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (UPPER): ${group}`);
      return group;
    }
    
    // TENTATIVA 3: Busca com TRIM
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE TRIM(NOMEUSU) = TRIM('${username}')`;
    console.log(`📝 SQL 3: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (TRIM): ${group}`);
      return group;
    }
    
    // TENTATIVA 4: Busca removendo todos os espaços
    const usernameNoSpaces = username.replace(/\s/g, '');
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE REPLACE(NOMEUSU, ' ', '') = '${usernameNoSpaces}'`;
    console.log(`📝 SQL 4: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (removendo espaços): ${group}`);
      return group;
    }
    
    // TENTATIVA 5: Busca com LIKE
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE NOMEUSU LIKE '%${username}%'`;
    console.log(`📝 SQL 5: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (LIKE): ${group}`);
      return group;
    }
    
    // TENTATIVA 6: Busca com LIKE UPPER
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE UPPER(NOMEUSU) LIKE UPPER('%${username}%')`;
    console.log(`📝 SQL 6: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (LIKE UPPER): ${group}`);
      return group;
    }
    
    // TENTATIVA 7: Busca com LIKE removendo espaços
    sql = `SELECT CODGRUPO FROM TSIUSU WHERE REPLACE(NOMEUSU, ' ', '') LIKE '%${usernameNoSpaces}%'`;
    console.log(`📝 SQL 7: ${sql}`);
    result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      const group = Number(result.rows[0][0]);
      console.log(`✅ Grupo encontrado (LIKE sem espaços): ${group}`);
      return group;
    }
    
    console.warn(`⚠️ Nenhum grupo encontrado para o usuário: "${username}"`);
    return null;
    
  } catch (error) {
    console.error('❌ Erro ao buscar grupo do usuário:', error);
    return null;
  }
};

// ==================== OUTRAS FUNÇÕES ====================

export const salvarConferenciaAPI = async (data: {
  NUNOTA: number;
  ORDEMCARGA: number;
  CONFERENTE: string;
  DESCRICAO: string;
  VOLUMES: string | number;
  COMPLETA: boolean;
}): Promise<any> => {
  const situacao = data.COMPLETA ? "Conferência completa" : "Conferência com divergência";
  
  const requestBody = {
    dataSet: {
      rootEntity: "AD_EXPEDICAODASH",
      includePresentationFields: "N",
      dataRow: {
        localFields: {
          NUNOTA: { "$": data.NUNOTA },
          CONFERENTE: { "$": data.CONFERENTE },
          DESCRICAO: { "$": data.DESCRICAO },
          ORDEMCARGA: { "$": data.ORDEMCARGA },
          VOLUMES: { "$": data.VOLUMES },
          SITUACAO: { "$": situacao }
        }
      },
      entity: {
        fieldset: {
          list: "CODIGO,NUNOTA,CONFERENTE,VOLUMES,SITUACAO"
        }
      }
    }
  };

  try {
    const result = await queryJson('CRUDServiceProvider.saveRecord', requestBody);
    return result;
    
  } catch (error) {
    console.error('Save conference error:', error);
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido ao salvar'
    );
  }
};

export const buscarCodUsu = async (username: string): Promise<number> => {
  try {
    const sql = `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username}'`;
    const result = await executeQuery(sql);
    
    if (result && result.rows && result.rows.length > 0) {
      return result.rows[0][0];
    } else {
      throw new Error('Usuário não encontrado na tabela TSIUSU');
    }
  } catch (error) {
    console.error('Erro ao buscar CODUSU:', error);
    throw error;
  }
};

export const salvarLoteAPI = async (
  nunota: number,
  codprod: number,
  lote: string,
  dataValidade: string
): Promise<any> => {
  try {
    console.log('🔄 Iniciando salvamento do lote:', { nunota, codprod, lote });

    const sqlVerificacaoLote = `SELECT NUNOTA FROM AD_LOTESALMOX WHERE NUNOTA = ${nunota}`;
    
    let existeLote = false;
    try {
      const resultVerificacao = await executeQuery(sqlVerificacaoLote);
      existeLote = resultVerificacao.rows.length > 0;
      console.log('📋 Verificação de registro em AD_LOTESALMOX:', existeLote);
    } catch (error) {
      console.log('ℹ️ Não foi possível verificar registro em AD_LOTESALMOX');
    }

    const requestBodyLoteSalmax = {
      dataSet: {
        rootEntity: "AD_LOTESALMOX",
        includePresentationFields: "N",
        dataRow: {
          localFields: {
            NUNOTA: { "$": nunota },
          },
          ...(existeLote && {
            key: {
              NUNOTA: { "$": nunota }
            }
          })
        },
        entity: {
          fieldset: {
            list: "NUNOTA"
          }
        }
      }
    };

    await queryJson('CRUDServiceProvider.saveRecord', requestBodyLoteSalmax);
    console.log('✅ Vínculo da nota salvo/atualizado com sucesso');

    const sqlVerificacaoProd = `
      SELECT CODIGO, NUNOTA, CODPROD FROM AD_LOTESPROD 
      WHERE NUNOTA = ${nunota} AND CODPROD = ${codprod}
    `;
    
    let codigoExistente = null;
    let existeProduto = false;
    
    try {
      const resultVerificacaoProd = await executeQuery(sqlVerificacaoProd);
      existeProduto = resultVerificacaoProd.rows.length > 0;
      
      if (existeProduto) {
        codigoExistente = resultVerificacaoProd.rows[0][0];
        console.log('📋 Registro existente em AD_LOTESPROD, CODIGO:', codigoExistente);
      }
    } catch (error) {
      console.log('ℹ️ Não foi possível verificar registro em AD_LOTESPROD');
    }

    const requestBodyLoteProd = {
      dataSet: {
        rootEntity: "AD_LOTESPROD",
        includePresentationFields: "N",
        dataRow: {
          localFields: {
            NUNOTA: { "$": nunota },
            CODPROD: { "$": codprod },
            LOTE: { "$": lote.trim() },
            DATAVAL: { "$": dataValidade }
          },
          ...(existeProduto && codigoExistente && {
            key: {
              CODIGO: { "$": codigoExistente }
            }
          })
        },
        entity: {
          fieldset: {
            list: "NUNOTA, CODPROD, LOTE"
          }
        }
      }
    };

    await queryJson('CRUDServiceProvider.saveRecord', requestBodyLoteProd);
    
    console.log('✅ Lote do produto salvo/atualizado com sucesso');
    return {
      success: true,
      nunota: nunota,
      codprod: codprod,
      lote: lote,
      operacao: existeProduto ? 'atualizado' : 'criado',
      message: existeProduto ? 'Lote atualizado com sucesso!' : 'Lote vinculado com sucesso!'
    };

  } catch (error: any) {
    console.error('❌ Erro completo ao salvar lote:', error);
    
    let errorMessage = 'Falha ao vincular o lote';
    
    if (error.response) {
      errorMessage = `Erro ${error.response.status}: ${error.response.data?.statusMessage || 'Erro desconhecido'}`;
    } else if (error.request) {
      errorMessage = 'Erro de conexão com o servidor';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

export const query = async (serviceName: string, requestBody: string): Promise<any> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="${escapeXml(serviceName)}">
  <requestBody>
    ${requestBody}
  </requestBody>
</serviceRequest>`;

  try {
    const bearerToken = await authService.getBearerToken();
    const response = await queryApi.post(
      `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=xml`,
      xmlRequest,
      { 
        responseType: 'text', 
        transformResponse: [data => data],
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Bearer ${bearerToken}`
        }
      }
    );

    const result = parser.parse(response.data);
    
    if (!result.serviceResponse || result.serviceResponse['@_status'] !== "1") {
      const errorMsg = result.serviceResponse?.statusMessage 
        ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
        : 'Erro na requisição';
      throw new Error(errorMsg);
    }

    return result.serviceResponse.responseBody;
  } catch (error) {
    console.error('Query error:', error);
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido na consulta'
    );
  }
};

// ==================== SEPARAÇÃO ====================


// ==================== HELPERS ====================

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

initializeAPI().catch(error => {
  console.error('Failed to initialize API:', error);
});

export default { loginApi, queryApi };