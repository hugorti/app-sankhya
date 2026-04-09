// services/api.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Buffer } from 'buffer';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { AuthService } from './auth';

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
    BASE_URL: 'https://api.sankhya.com.br/gateway/v1/mge/', // Ajuste conforme necessário
    DEFAULT_IP: '',
    DEFAULT_PORT: '',
    AUTH_URL: 'https://api.sankhya.com.br/authenticate', // Ajuste conforme necessário
    CLIENT_ID: '3112542a-4a20-4e08-92a2-298649f74911',
    CLIENT_SECRET: 'lvzGUmX7LOB5X60XVo22Sr9g2ph3GRS9',
    X_TOKEN: 'fa55d0c2-c607-4ac8-8f4f-c4d4ff7576cf',
  }
};

// Ambiente atual (será carregado do AsyncStorage)
let currentEnvironment: EnvironmentType = 'TEST';

// ==================== FIM DAS CONFIGURAÇÕES ====================

const SERVER_URL_KEY = 'saved_server_url';
const ENVIRONMENT_KEY = 'selected_environment';
const DEFAULT_IP = '';
const DEFAULT_PORT = '';
const DEFAULT_URL = `${DEFAULT_IP}:${DEFAULT_PORT}`;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

// URL base atual (será atualizada quando o ambiente mudar)
let currentBaseURL = `http://${DEFAULT_URL}/mge/`;

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

// Inicializar AuthService
const authService = AuthService.getInstance();

// Criar instância do axios para login (rota original)
let loginApi: AxiosInstance = axios.create({
  baseURL: currentBaseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/xml; charset=ISO-8859-1',
    'Accept': 'application/xml'
  }
});

// Criar instância do axios para consultas (nova rota Sandbox)
let queryApi: AxiosInstance = axios.create({
  baseURL: ENVIRONMENTS.TEST.BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// ==================== FUNÇÕES DE GERENCIAMENTO DE AMBIENTE ====================

// Obter configuração do ambiente atual
export const getCurrentEnvironmentConfig = (): EnvironmentConfig => {
  return ENVIRONMENTS[currentEnvironment];
};

// Obter ambiente atual
export const getCurrentEnvironment = (): EnvironmentType => {
  return currentEnvironment;
};

// Salvar ambiente selecionado
export const setEnvironment = async (environment: EnvironmentType): Promise<void> => {
  try {
    currentEnvironment = environment;
    await AsyncStorage.setItem(ENVIRONMENT_KEY, environment);
    
    // Atualizar a URL base da queryApi
    const config = ENVIRONMENTS[environment];
    queryApi.defaults.baseURL = config.BASE_URL;
    
    // Atualizar AuthService com novas credenciais
    await updateAuthCredentials(config);
    
    console.log(`✅ Ambiente alterado para: ${config.name}`);
    console.log(`📡 URL base: ${config.BASE_URL}`);
  } catch (error) {
    console.error('❌ Erro ao salvar ambiente:', error);
    throw error;
  }
};

// Carregar ambiente salvo
export const loadSavedEnvironment = async (): Promise<EnvironmentType> => {
  try {
    const saved = await AsyncStorage.getItem(ENVIRONMENT_KEY);
    if (saved === 'TEST' || saved === 'PRODUCTION') {
      currentEnvironment = saved;
      const config = ENVIRONMENTS[currentEnvironment];
      queryApi.defaults.baseURL = config.BASE_URL;
      await updateAuthCredentials(config);
      console.log(`📌 Ambiente carregado: ${config.name}`);
      return currentEnvironment;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar ambiente:', error);
  }
  return 'TEST'; // Padrão
};

// Atualizar credenciais do AuthService
const updateAuthCredentials = async (config: EnvironmentConfig): Promise<void> => {
  try {
    // Atualizar as variáveis no AuthService (você precisará modificar o AuthService para aceitar isso)
    await authService.updateCredentials({
      AUTH_URL: config.AUTH_URL,
      CLIENT_ID: config.CLIENT_ID,
      CLIENT_SECRET: config.CLIENT_SECRET,
      X_TOKEN: config.X_TOKEN
    });
    
    // Invalidar token antigo para gerar novo com as novas credenciais
    await authService.invalidateToken();
    
    console.log('🔐 Credenciais atualizadas para o novo ambiente');
  } catch (error) {
    console.error('❌ Erro ao atualizar credenciais:', error);
  }
};

// ==================== FUNÇÕES EXISTENTES ====================

// Funções para gerenciar inatividade
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

// Helper function to validate and format server URL
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

// Set base URL with validation
export const setBaseURL = async (ipPort: string): Promise<boolean> => {
  try {
    const formattedUrl = formatServerUrl(ipPort);
    await axios.get(formattedUrl, { timeout: 5000 });
    currentBaseURL = formattedUrl;
    recreateLoginApiInstance(currentBaseURL);
    const cleanIpPort = ipPort.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanIpPort);
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

// Initialize API with saved URL
export const initializeAPI = async (): Promise<void> => {
  try {
    // Carregar ambiente salvo
    await loadSavedEnvironment();
    
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (saved) {
      const formattedUrl = formatServerUrl(saved);
      currentBaseURL = formattedUrl;
      recreateLoginApiInstance(currentBaseURL);
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

// Configurar interceptors para Login API
const configureLoginInterceptors = () => {
  // Request interceptor para adicionar token Bearer
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

  // Response interceptor para tratar erros de autenticação
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

// Configurar interceptors para Query API (Sandbox)
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

// Executar configuração dos interceptors
configureLoginInterceptors();
configureQueryInterceptors();

// Função de login (mantém a rota original)
export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="MobileLoginSP.login">
  <requestBody>
    <NOMUSU>${escapeXml(username)}</NOMUSU>
    <INTERNO>${escapeXml(password)}</INTERNO>
  </requestBody>
</serviceRequest>`;

  try {
    clearInactivityTimer();
    
    const bearerToken = await authService.getBearerToken();
    if (!bearerToken) {
      throw new Error('Não foi possível obter token de autenticação');
    }
    
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
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido durante login'
    );
  }
};

// Função de logout (usa a rota original)
export const logout = async (isAutoLogout = false): Promise<void> => {
  try {
    clearInactivityTimer();
    await authService.invalidateToken();
    
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
    await authService.invalidateToken();
  }
};

// Função queryJson
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

// Função para executar query SQL
export const executeQuery = async (sql: string): Promise<any> => {
  try {
    console.log('🔍 Executando SQL:', sql);
    
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

// Função salvar conferência
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

// Função para buscar CODUSU
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
}

// Função para salvar lote
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

// Função query para XML
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

// XML escape helper
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

// Initialize API on load
initializeAPI().catch(error => {
  console.error('Failed to initialize API:', error);
});

export default { loginApi, queryApi };