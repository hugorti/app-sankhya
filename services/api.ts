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
  AUTH_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  X_TOKEN: string;
}

export const ENVIRONMENTS: Record<EnvironmentType, EnvironmentConfig> = {
  TEST: {
    name: 'Ambiente Teste (Sandbox)',
    BASE_URL: 'https://api.sandbox.sankhya.com.br/gateway/v1/mge/',
    AUTH_URL: 'https://api.sandbox.sankhya.com.br/authenticate',
    CLIENT_ID: '25a5c6d7-a3f1-4149-866b-f06b4d23cd00',
    CLIENT_SECRET: '9aVXcCy6rtB0LMZb35rSQaDG1sMjkAI0',
    X_TOKEN: '742ed59c-fb1d-47c6-965e-d250a438556d',
  },
  PRODUCTION: {
    name: 'Ambiente Produção',
    BASE_URL: 'https://api.sankhya.com.br/gateway/v1/mge/',
    AUTH_URL: 'https://api.sankhya.com.br/authenticate',
    CLIENT_ID: '3112542a-4a20-4e08-92a2-298649f74911',
    CLIENT_SECRET: 'lvzGUmX7LOB5X60XVo22Sr9g2ph3GRS9',
    X_TOKEN: 'fa55d0c2-c607-4ac8-8f4f-c4d4ff7576cf',
  },
};

let currentEnvironment: EnvironmentType = 'TEST';

const ENVIRONMENT_KEY = 'selected_environment';
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

let currentBaseURL = ENVIRONMENTS.TEST.BASE_URL;

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
    'Accept': 'application/xml',
  },
});

let queryApi: AxiosInstance = axios.create({
  baseURL: ENVIRONMENTS.TEST.BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ==================== GERENCIAMENTO DE AMBIENTE ====================

export const getCurrentEnvironmentConfig = (): EnvironmentConfig =>
  ENVIRONMENTS[currentEnvironment];

export const getCurrentEnvironment = (): EnvironmentType => currentEnvironment;

export const getCurrentApiURL = (): string =>
  queryApi.defaults.baseURL || 'URL não configurada';

export const getConfigDetails = (): {
  environment: EnvironmentType;
  url: string;
  isManual: boolean;
} => {
  return {
    environment: currentEnvironment,
    url: queryApi.defaults.baseURL || 'URL não configurada',
    isManual: false,
  };
};

export const setEnvironment = async (environment: EnvironmentType): Promise<void> => {
  try {
    console.log(`🔄 Mudando para ambiente: ${environment}`);
    currentEnvironment = environment;
    await AsyncStorage.setItem(ENVIRONMENT_KEY, environment);

    const config = ENVIRONMENTS[environment];

    await updateAuthCredentials(config);

    queryApi.defaults.baseURL = config.BASE_URL;
    currentBaseURL = config.BASE_URL;
    recreateLoginApiInstance(config.BASE_URL);

    await authService.invalidateToken();
    await AsyncStorage.removeItem('sankhya_session');

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
    await authService.updateCredentials({
      AUTH_URL: config.AUTH_URL,
      CLIENT_ID: config.CLIENT_ID,
      CLIENT_SECRET: config.CLIENT_SECRET,
      X_TOKEN: config.X_TOKEN,
    });
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
      await updateAuthCredentials(config);
      queryApi.defaults.baseURL = config.BASE_URL;
      currentBaseURL = config.BASE_URL;
      console.log(`📌 Ambiente carregado: ${config.name}`);
      console.log(`📍 URL do ambiente: ${config.BASE_URL}`);
      return currentEnvironment;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar ambiente:', error);
  }
  return 'TEST';
};

// ==================== USUÁRIO ====================

export const setCurrentUser = (username: string): void => {
  authService.setCurrentUser(username);
  console.log(`👤 Usuário definido na API: ${username}`);
};

// ==================== INATIVIDADE ====================

export const setupInactivityListener = (callback: () => Promise<void>) => {
  onInactiveCallback = async () => {
    try {
      await logout(true);
      await callback();
    } catch {
      await AsyncStorage.removeItem('sankhya_session');
      await callback();
    }
  };

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  lastActivityTime = Date.now();

  appStateSubscription = AppState.addEventListener(
    'change',
    async (nextAppState: AppStateStatus) => {
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
    }
  );

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

// ==================== COMPATIBILIDADE ====================

export const setManualURL = async (_ipPort: string): Promise<boolean> => {
  throw new Error(
    'Configuração manual de IP não é mais suportada. Use os ambientes TEST (Sandbox) ou PRODUCTION.'
  );
};

export const setBaseURL = async (_ipPort: string): Promise<boolean> => {
  return await setManualURL(_ipPort);
};

export const resetToEnvironmentURL = (): void => {
  const config = ENVIRONMENTS[currentEnvironment];
  queryApi.defaults.baseURL = config.BASE_URL;
  currentBaseURL = config.BASE_URL;
  recreateLoginApiInstance(config.BASE_URL);
  console.log(`🔄 Resetado para URL do ambiente: ${config.BASE_URL}`);
};

// ==================== INICIALIZAÇÃO ====================

export const initializeAPI = async (): Promise<void> => {
  try {
    await loadSavedEnvironment();
    const config = ENVIRONMENTS[currentEnvironment];
    queryApi.defaults.baseURL = config.BASE_URL;
    currentBaseURL = config.BASE_URL;
    recreateLoginApiInstance(config.BASE_URL);
    console.log(`✅ API inicializada com URL: ${config.BASE_URL}`);

    const session = await AsyncStorage.getItem('sankhya_session');
    if (session) {
      const sessionData = JSON.parse(session);
      if (sessionData.username) {
        setCurrentUser(sessionData.username);
        console.log('👤 Usuário recuperado da sessão');
      }
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
      'Accept': 'application/xml',
    },
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
        if (jsessionid) config.headers.Cookie = `JSESSIONID=${jsessionid}`;
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
        console.log('🔐 Token expirado, renovando (force refresh)...');
        try {
          await authService.invalidateToken();
          const newToken = await authService.getBearerToken(true);
          if (newToken && error.config) {
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
          const newToken = await authService.getBearerToken(true);
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
        console.log('🔐 Token expirado na consulta, renovando (force refresh)...');
        try {
          await authService.invalidateToken();
          const newToken = await authService.getBearerToken(true);
          if (newToken && error.config) {
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

// ==================== LOGIN / LOGOUT ====================

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
    setCurrentUser(username);

    console.log('♻️ Invalidando token antigo antes do login...');
    await authService.invalidateToken();

    console.log('🔐 Gerando novo token via /authenticate...');
    const bearerToken = await authService.getBearerToken(true);

    if (!bearerToken) {
      throw new Error('Não foi possível obter bearerToken via /authenticate');
    }

    console.log(`📍 URL de login: ${loginApi.defaults.baseURL}`);

    const response = await loginApi.post(
      'service.sbr?serviceName=MobileLoginSP.login',
      xmlRequest,
      {
        responseType: 'text',
        transformResponse: [
          (data) => {
            if (!data || typeof data !== 'string') {
              throw new Error('Resposta vazia do servidor');
            }
            return data;
          },
        ],
        headers: { Authorization: `Bearer ${bearerToken}` },
      }
    );

    if (typeof response.data !== 'string') {
      throw new Error('Resposta inválida do servidor: não é texto');
    }

    const result = parser.parse(response.data);

    if (!result.serviceResponse) throw new Error('Estrutura de resposta inválida');

    if (result.serviceResponse['@_status'] !== '1') {
      const errorMsg = result.serviceResponse?.statusMessage
        ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
        : 'Credenciais inválidas ou serviço indisponível';
      throw new Error(errorMsg);
    }

    if (
      !result.serviceResponse.responseBody ||
      !result.serviceResponse.responseBody.jsessionid ||
      !result.serviceResponse.responseBody.idusu
    ) {
      throw new Error('Dados de sessão incompletos na resposta');
    }

    const transactionId = result.serviceResponse['@_transactionId'] || '';

    const sessionData: LoginResponse = {
      jsessionid: result.serviceResponse.responseBody.jsessionid,
      idusu: result.serviceResponse.responseBody.idusu.trim(),
      callID: result.serviceResponse.responseBody.callID || '',
      transactionId,
    };

    await AsyncStorage.setItem(
      'sankhya_session',
      JSON.stringify({ ...sessionData, username, timestamp: Date.now() })
    );

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
    let username: string | null = null;
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
        loginApi.post('service.sbr?serviceName=MobileLoginSP.logout'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);
    } else {
      await loginApi.post('service.sbr?serviceName=MobileLoginSP.logout');
    }
  } catch (error) {
    if (
      !isAutoLogout ||
      (axios.isAxiosError(error) && error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK')
    ) {
      console.warn('Logout error:', error);
    }
  } finally {
    await AsyncStorage.removeItem('sankhya_session');
  }
};

// ==================== CONSULTAS ====================

export const queryJson = async (serviceName: string, requestBody: any): Promise<any> => {
  try {
    const bearerToken = await authService.getBearerToken();
    if (!bearerToken) throw new Error('Token de autenticação não encontrado');

    const payload = { serviceName, requestBody };

    console.log(`📤 Enviando requisição para: ${serviceName}`);
    console.log(`📍 URL base: ${queryApi.defaults.baseURL}`);

    const response = await queryApi.post(
      `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=json`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    console.log('📥 Resposta recebida, status:', response.status);

    if (response.data && response.data.status !== undefined) {
      if (response.data.status !== '1' && response.data.status !== 1) {
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
    console.log('🔍 Executando SQL:', sql);
    return await queryJson('DbExplorerSP.executeQuery', { sql });
  } catch (error) {
    console.error('❌ Erro ao executar query:', error);
    throw error;
  }
};

// ==================== GRUPO DO USUÁRIO ====================

export const buscarGrupoUsuario = async (username: string): Promise<number | null> => {
  try {
    console.log(`🔍 Buscando grupo do usuário: "${username}"`);

    const attempts = [
      `SELECT CODGRUPO FROM TSIUSU WHERE NOMEUSU = '${username}'`,
      `SELECT CODGRUPO FROM TSIUSU WHERE UPPER(NOMEUSU) = UPPER('${username}')`,
      `SELECT CODGRUPO FROM TSIUSU WHERE TRIM(NOMEUSU) = TRIM('${username}')`,
      `SELECT CODGRUPO FROM TSIUSU WHERE REPLACE(NOMEUSU, ' ', '') = '${username.replace(/\s/g, '')}'`,
      `SELECT CODGRUPO FROM TSIUSU WHERE NOMEUSU LIKE '%${username}%'`,
      `SELECT CODGRUPO FROM TSIUSU WHERE UPPER(NOMEUSU) LIKE UPPER('%${username}%')`,
    ];

    for (let i = 0; i < attempts.length; i++) {
      const result = await executeQuery(attempts[i]);
      if (result && result.rows && result.rows.length > 0) {
        const group = Number(result.rows[0][0]);
        console.log(`✅ Grupo encontrado (tentativa ${i + 1}): ${group}`);
        return group;
      }
    }

    console.warn(`⚠️ Nenhum grupo encontrado para: "${username}"`);
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar grupo:', error);
    return null;
  }
};

export const buscarGrupoUsuarioOuDeslogar = async (
  username: string
): Promise<number> => {
  const grupo = await buscarGrupoUsuario(username);

  if (grupo === null) {
    console.warn(
      `🚪 Grupo não encontrado para "${username}". Executando logout automático.`
    );
    try {
      await logout();
    } catch (err) {
      console.error('❌ Erro ao executar logout automático:', err);
    }
    throw new Error(
      'Não foi possível identificar o grupo do usuário. Faça login novamente.'
    );
  }

  return grupo;
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
  const situacao = data.COMPLETA ? 'Conferência completa' : 'Conferência com divergência';
  const requestBody = {
    dataSet: {
      rootEntity: 'AD_EXPEDICAODASH',
      includePresentationFields: 'N',
      dataRow: {
        localFields: {
          NUNOTA: { $: data.NUNOTA },
          CONFERENTE: { $: data.CONFERENTE },
          DESCRICAO: { $: data.DESCRICAO },
          ORDEMCARGA: { $: data.ORDEMCARGA },
          VOLUMES: { $: data.VOLUMES },
          SITUACAO: { $: situacao },
        },
      },
      entity: { fieldset: { list: 'CODIGO,NUNOTA,CONFERENTE,VOLUMES,SITUACAO' } },
    },
  };
  return await queryJson('CRUDServiceProvider.saveRecord', requestBody);
};

export const buscarCodUsu = async (username: string): Promise<number> => {
  const result = await executeQuery(`SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username}'`);
  if (result?.rows?.length > 0) return result.rows[0][0];
  throw new Error('Usuário não encontrado na tabela TSIUSU');
};

export const query = async (serviceName: string, requestBody: string): Promise<any> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="${escapeXml(serviceName)}">
  <requestBody>${requestBody}</requestBody>
</serviceRequest>`;

  const bearerToken = await authService.getBearerToken();
  const response = await queryApi.post(
    `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=xml`,
    xmlRequest,
    {
      responseType: 'text',
      transformResponse: [(data) => data],
      headers: {
        'Content-Type': 'application/xml',
        Authorization: `Bearer ${bearerToken}`,
      },
    }
  );

  const result = parser.parse(response.data);
  if (!result.serviceResponse || result.serviceResponse['@_status'] !== '1') {
    const errorMsg = result.serviceResponse?.statusMessage
      ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
      : 'Erro na requisição';
    throw new Error(errorMsg);
  }
  return result.serviceResponse.responseBody;
};

// ==================== SEPARAÇÃO ====================

export interface ItemSeparacao {
  NUTAREFA: number;
  NUNOTA: number;
  OC: number;
  NUSEPARACAO: number;
  CODPROD: number;
  DESCRPROD: string;
  REFERENCIA: string;
  LOTE: string;
  CODENDORIGEM: number;
  ENDERECO: string;
  UNIDADE_ESTOQUE: string;
  ESTOQUE: number;
  SAIDASPEND: number;
  CODBARRA: string;
  QTD_POR_CAIXA: number;
  QTD_BIPAR: number;
  BLOQUEADO: number;
}

export interface ValidacaoEstoque {
  podeSeparar: boolean;
  itens: ItemSeparacao[];
  bloqueados: ItemSeparacao[];
}

export const salvarSeparacaoWMS = async (data: {
  NUNOTA: number;
  NUTAREFA: number;
  NUSEPARACAO: number;
  ORDEMCARGA: number;
  CODPROD: number;
  DESCRPROD: string;
  REFERENCIA: string;
  CONTROLE: string;
  VOLUMES: string;
  USUARIO: string;
}): Promise<any> => {
  const requestBody = {
    dataSet: {
      rootEntity: 'AD_SEPARACAOWMS',
      includePresentationFields: 'N',
      dataRow: {
        localFields: {
          NUNOTA: { $: data.NUNOTA },
          NUTAREFA: { $: data.NUTAREFA },
          NUSEPARACAO: { $: data.NUSEPARACAO },
          ORDEMCARGA: { $: data.ORDEMCARGA },
          CODPROD: { $: data.CODPROD },
          DESCRPROD: { $: data.DESCRPROD },
          REFERENCIA: { $: data.REFERENCIA },
          CONTROLE: { $: data.CONTROLE },
          VOLUMES: { $: data.VOLUMES },
          USUARIO: { $: data.USUARIO },
        },
      },
      entity: {
        fieldset: {
          list:
            'NUNOTA,NUTAREFA,NUSEPARACAO,ORDEMCARGA,CODPROD,DESCRPROD,REFERENCIA,CONTROLE,VOLUMES,USUARIO',
        },
      },
    },
  };

  return await queryJson('CRUDServiceProvider.saveRecord', requestBody);
};

const buscarSequenciasTarefa = async (nutarefa: number): Promise<number[]> => {
  const sql = `
    SELECT SEQUENCIA
    FROM SANKHYA.TGWITT
    WHERE NUTAREFA = ${Number(nutarefa)}
    ORDER BY SEQUENCIA
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const rows: any[] = result?.rows ?? [];
  return rows.map((r) => Number(r[0]) || 0).filter((n) => n > 0);
};

export const iniciarSeparacaoWMS = async (nutarefa: number): Promise<any> => {
  const sequencias = await buscarSequenciasTarefa(nutarefa);

  if (sequencias.length === 0) {
    console.warn(`⚠️ Nenhum item encontrado na TGWITT para a tarefa ${nutarefa}`);
    return { atualizados: 0 };
  }

  const resultados: any[] = [];

  for (const sequencia of sequencias) {
    const requestBody = {
      dataSet: {
        rootEntity: 'ItemTarefa',
        includePresentationFields: 'N',
        dataRow: {
          key: {
            NUTAREFA: { $: nutarefa },
            SEQUENCIA: { $: sequencia },
          },
          localFields: {
            SITUACAO: { $: 'E' },
          },
        },
        entity: {
          fieldset: { list: 'NUTAREFA,SEQUENCIA,SITUACAO' },
        },
      },
    };

    const res = await queryJson('CRUDServiceProvider.saveRecord', requestBody);
    resultados.push(res);
  }

  console.log(
    `▶️ Tarefa ${nutarefa}: ${sequencias.length} item(ns) marcados como 'E'`
  );

  return { atualizados: sequencias.length, resultados };
};

export const rejeitarSeparacaoWMS = async (nutarefa: number): Promise<any> => {
  const sequencias = await buscarSequenciasTarefa(nutarefa);

  if (sequencias.length === 0) {
    console.warn(`⚠️ Nenhum item encontrado na TGWITT para a tarefa ${nutarefa}`);
    return { atualizados: 0 };
  }

  const resultados: any[] = [];

  for (const sequencia of sequencias) {
    const requestBody = {
      dataSet: {
        rootEntity: 'ItemTarefa',
        includePresentationFields: 'N',
        dataRow: {
          key: {
            NUTAREFA: { $: nutarefa },
            SEQUENCIA: { $: sequencia },
          },
          localFields: {
            SITUACAO: { $: 'A' },
            CODUSUEXEC: { $: null },
            DHINICIALEXEC: { $: null },
          },
        },
        entity: {
          fieldset: {
            list: 'NUTAREFA,SEQUENCIA,SITUACAO,CODUSUEXEC,DHINICIALEXEC',
          },
        },
      },
    };

    const res = await queryJson('CRUDServiceProvider.saveRecord', requestBody);
    resultados.push(res);
  }

  console.log(
    `◀️ Tarefa ${nutarefa}: ${sequencias.length} item(ns) rejeitados para 'A'`
  );

  return { atualizados: sequencias.length, resultados };
};

// ==================== SEPARAÇÃO — MOVIMENTAÇÃO DE ESTOQUE ====================

/**
 * Converte um endereço (XX.XX.XX) em CODEND.
 */
export const buscarCodEndPorEndereco = async (
  endereco: string
): Promise<number | null> => {
  const digitos = endereco.replace(/\D/g, '');
  if (digitos.length !== 6) {
    throw new Error('O endereço de destino deve ter exatamente 6 dígitos (XX.XX.XX).');
  }
  const formatado = `${digitos.slice(0, 2)}.${digitos.slice(2, 4)}.${digitos.slice(4, 6)}`;

  const sql = `
    SELECT TOP 1 CODEND
    FROM SANKHYA.TGWEND
    WHERE ENDERECO = '${formatado}'
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const rows: any[] = result?.rows ?? [];
  if (rows.length === 0) return null;
  return Number(rows[0][0]) || null;
};

/**
 * Dados de um item da TGWITT.
 */
export const buscarItemTarefaWMS = async (
  nutarefa: number,
  sequencia: number
): Promise<{
  QTDDEST: number;
  CODENDDESTINO: number;
  CODPROD: number;
  CONTROLE: string;
} | null> => {
  const sql = `
    SELECT
      ISNULL(QTDDEST, 0)       AS QTDDEST,
      ISNULL(CODENDDESTINO, 0) AS CODENDDESTINO,
      CODPROD,
      CONTROLE
    FROM SANKHYA.TGWITT
    WHERE NUTAREFA = ${Number(nutarefa)}
      AND SEQUENCIA = ${Number(sequencia)}
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const rows: any[] = result?.rows ?? [];
  if (rows.length === 0) return null;
  return {
    QTDDEST: Number(rows[0][0]) || 0,
    CODENDDESTINO: Number(rows[0][1]) || 0,
    CODPROD: Number(rows[0][2]) || 0,
    CONTROLE: rows[0][3] || '',
  };
};

/**
 * Fator de conversão (TGFVOA.QUANTIDADE) do produto para uma unidade.
 */
export const buscarFatorConversaoWMS = async (
  codprod: number,
  codvol: string
): Promise<number> => {
  const sql = `
    SELECT TOP 1 ISNULL(QUANTIDADE, 1)
    FROM SANKHYA.TGFVOA
    WHERE CODPROD = ${Number(codprod)}
      AND CODVOL = '${codvol}'
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const rows: any[] = result?.rows ?? [];
  if (rows.length === 0) return 1;
  return Number(rows[0][0]) || 1;
};

/**
 * Ajusta o estoque na TGWEST via entidade CRUD EstoqueEndereco.
 * PK composta: CODEMP + CODEND + CODPROD + CONTROLE.
 * Se a linha existir faz UPDATE; senão INSERT.
 * Recalcula ESTOQUEVOLPAD conforme CODVOL:
 *   - 'CX' → ESTOQUEVOLPAD = ESTOQUE * TGFVOA.QUANTIDADE ('UN')
 *   - outros → ESTOQUEVOLPAD = ESTOQUE
 */
export const ajustarEstoqueWMS = async (data: {
  CODEND: number;
  CODPROD: number;
  CONTROLE: string;
  QTDDEST: number;
  OPERACAO: 'SOMA' | 'SUBTRAI';
}): Promise<void> => {
  // CODEMP fixo = 2 (empresa do WMS). Se precisar suportar multiempresa,
  // passe o CODEMP por parâmetro.
  const CODEMP = 2;

  // 1) Verifica se a linha existe (para decidir UPDATE x INSERT)
  const sqlBusca = `
    SELECT
      ISNULL(ESTOQUE, 0)       AS ESTOQUE,
      ISNULL(CODVOL, 'UN')     AS CODVOL,
      ISNULL(CODEMP, ${CODEMP}) AS CODEMP
    FROM SANKHYA.TGWEST
    WHERE CODEMP   = ${CODEMP}
      AND CODEND   = ${Number(data.CODEND)}
      AND CODPROD  = ${Number(data.CODPROD)}
      AND CONTROLE = '${data.CONTROLE}'
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql: sqlBusca });
  const rows: any[] = result?.rows ?? [];
  const existe = rows.length > 0;

  let estoqueAtual = 0;
  let codvol = 'UN';

  if (existe) {
    estoqueAtual = Number(rows[0][0]) || 0;
    codvol = rows[0][1] || 'UN';
  }

  // 2) Calcula novo estoque
  const novoEstoque =
    data.OPERACAO === 'SOMA'
      ? estoqueAtual + data.QTDDEST
      : estoqueAtual - data.QTDDEST;

  const estoqueFinal = novoEstoque < 0 ? 0 : novoEstoque;

  // 3) Calcula ESTOQUEVOLPAD
  let estoqueVolPad = estoqueFinal;
  if (codvol === 'CX') {
    const fator = await buscarFatorConversaoWMS(data.CODPROD, 'UN');
    estoqueVolPad = estoqueFinal * fator;
  }

  // 4) Monta o payload com PK completa (CODEMP + CODEND + CODPROD + CONTROLE)
  const requestBody = {
    dataSet: {
      rootEntity: 'EstoqueEndereco',
      includePresentationFields: 'N',
      dataRow: {
        key: existe
          ? {
              CODEMP: { $: CODEMP },
              CODEND: { $: data.CODEND },
              CODPROD: { $: data.CODPROD },
              CONTROLE: { $: data.CONTROLE },
            }
          : undefined,
        localFields: {
          CODEMP: { $: CODEMP },
          CODEND: { $: data.CODEND },
          CODPROD: { $: data.CODPROD },
          CONTROLE: { $: data.CONTROLE },
          ESTOQUE: { $: estoqueFinal },
          ESTOQUEVOLPAD: { $: estoqueVolPad },
          CODVOL: { $: codvol },
        },
      },
      entity: {
        fieldset: {
          list: 'CODEMP,CODEND,CODPROD,CONTROLE,ESTOQUE,ESTOQUEVOLPAD,CODVOL',
        },
      },
    },
  };

  await queryJson('CRUDServiceProvider.saveRecord', requestBody);
};

export const moverEstoqueItemWMS = async (data: {
  NUTAREFA: number;
  SEQUENCIA: number;
  CODPROD: number;
  CONTROLE: string;
  CODEND_ANTERIOR: number;
  CODEND_NOVO: number;
  QTDDEST: number;
}): Promise<void> => {
  const requestBody = {
    dataSet: {
      rootEntity: 'ItemTarefa',
      includePresentationFields: 'N',
      dataRow: {
        key: {
          NUTAREFA: { $: data.NUTAREFA },
          SEQUENCIA: { $: data.SEQUENCIA },
        },
        localFields: {
          SITUACAO: { $: 'F' },
          CODENDDESTINO: { $: data.CODEND_NOVO },
        },
      },
      entity: {
        fieldset: {
          list: 'NUTAREFA,SEQUENCIA,SITUACAO,CODENDDESTINO',
        },
      },
    },
  };

  await queryJson('CRUDServiceProvider.saveRecord', requestBody);
};

/**
 * Verifica se todos os itens da tarefa estão com SITUACAO = 'F' na TGWITT.
 */
export const verificarTodosItensFinalizadosWMS = async (
  nutarefa: number
): Promise<boolean> => {
  const sql = `
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN SITUACAO = 'F' THEN 1 ELSE 0 END) AS FINALIZADOS
    FROM SANKHYA.TGWITT
    WHERE NUTAREFA = ${Number(nutarefa)}
  `;
  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const row = result?.rows?.[0] ?? [0, 0];
  const total = Number(row[0]) || 0;
  const finalizados = Number(row[1]) || 0;
  return total > 0 && total === finalizados;
};

/**
 * Finaliza a Tarefa (TGWTAR) e a Separação (TGWSEP) quando todos
 * os itens da NUTAREFA foram concluídos.
 */
export const finalizarTarefaWMS = async (data: {
  NUTAREFA: number;
  NUSEPARACAO: number;
}): Promise<any> => {
  const resultados: any = {};

  try {
    const requestTarefa = {
      dataSet: {
        rootEntity: 'Tarefa',
        includePresentationFields: 'N',
        dataRow: {
          key: { NUTAREFA: { $: data.NUTAREFA } },
          localFields: { SITUACAO: { $: 'F' } },
        },
        entity: { fieldset: { list: 'NUTAREFA,SITUACAO' } },
      },
    };
    resultados.tarefa = await queryJson('CRUDServiceProvider.saveRecord', requestTarefa);
  } catch (err) {
    console.warn('⚠️ Falha ao finalizar Tarefa (TGWTAR):', err);
    resultados.tarefa = { error: err };
  }

  try {
    const requestSep = {
      dataSet: {
        rootEntity: 'Separacao',
        includePresentationFields: 'N',
        dataRow: {
          key: { NUSEPARACAO: { $: data.NUSEPARACAO } },
          localFields: { SITUACAO: { $: 2 } },
        },
        entity: { fieldset: { list: 'NUSEPARACAO,SITUACAO' } },
      },
    };
    resultados.separacao = await queryJson('CRUDServiceProvider.saveRecord', requestSep);
  } catch (err) {
    console.warn('⚠️ Falha ao finalizar Separação (TGWSEP):', err);
    resultados.separacao = { error: err };
  }

  return resultados;
};

// ==================== VERIFICAÇÃO WMS ====================

export const verificarSeparacaoConcluida = async (
  nutarefa: number
): Promise<boolean> => {
  const sql = `
    SELECT COUNT(*) AS QTD
    FROM AD_SEPARACAOWMS
    WHERE NUTAREFA = ${Number(nutarefa)}
  `;

  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const qtd = Number(result?.rows?.[0]?.[0] ?? 0);
  return qtd > 0;
};

export const verificarTarefasConcluidas = async (
  nutarefas: number[]
): Promise<Set<number>> => {
  if (nutarefas.length === 0) return new Set();

  const lista = nutarefas.join(',');
  const sql = `
    SELECT DISTINCT NUTAREFA
    FROM AD_SEPARACAOWMS
    WHERE NUTAREFA IN (${lista})
  `;

  const result = await queryJson('DbExplorerSP.executeQuery', { sql });
  const rows: any[] = result?.rows ?? [];
  return new Set(rows.map((r) => Number(r[0])));
};

// ==================== HELPERS ====================

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

initializeAPI().catch((error) => {
  console.error('Failed to initialize API:', error);
});

export default { loginApi, queryApi };