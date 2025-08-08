// services/api.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Buffer } from 'buffer';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, AppStateStatus } from 'react-native';

const SERVER_URL_KEY = 'saved_server_url';
const DEFAULT_IP = '';
const DEFAULT_PORT = '8180';
const DEFAULT_URL = `${DEFAULT_IP}:${DEFAULT_PORT}`;
const INACTIVITY_TIMEOUT = 60000; // 5 minutos em milissegundos

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
}

let currentBaseURL = `http://${DEFAULT_URL}/mge/`;
let inactivityTimer: number | null = null;
let appStateListener: (() => void) | null = null;
let onInactiveCallback: (() => Promise<void>) | null = null;

let appStateSubscription: { remove: () => void } | null = null;

// Funções para gerenciar inatividade
const resetInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  inactivityTimer = setTimeout(async () => {
    try {
      if (onInactiveCallback) {
        await onInactiveCallback();
      }
    } catch (error) {
      console.error('Erro durante logout automático:', error);
    }
  }, INACTIVITY_TIMEOUT) as unknown as number;
};

export const setupInactivityListener = (callback: () => Promise<void>) => {
  onInactiveCallback = callback;
  
  // Limpar subscription existente
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // Configurar novo listener
  appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      resetInactivityTimer();
    } else {
      clearInactivityTimer();
    }
  });

  resetInactivityTimer();
};

export const clearInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
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
    api.defaults.baseURL = currentBaseURL;
    
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

// Initialize API with saved URL or default
export const initializeAPI = async (): Promise<void> => {
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (saved) {
      await setBaseURL(saved);
    }
  } catch (error) {
    api.defaults.baseURL = currentBaseURL;
  }
};

const api: AxiosInstance = axios.create({
  baseURL: currentBaseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/xml; charset=ISO-8859-1',
    'Accept': 'application/xml'
  }
});

// Request interceptor for session handling
api.interceptors.request.use(async (config) => {
  try {
    const session = await AsyncStorage.getItem('sankhya_session');
    if (session) {
      const { jsessionid } = JSON.parse(session);
      if (jsessionid) {
        config.headers.Cookie = `JSESSIONID=${jsessionid}`;
      }
      resetInactivityTimer();
    }
    return config;
  } catch (error) {
    return config;
  }
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    resetInactivityTimer();
    return response;
  },
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('sankhya_session');
      clearInactivityTimer();
    }
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Timeout: O servidor não respondeu');
    }
    
    if (!error.response) {
      throw new Error('Erro de conexão. Verifique sua internet.');
    }
    
    return Promise.reject(error);
  }
);

// services/api.ts (parte do login)
export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="MobileLoginSP.login">
  <requestBody>
    <NOMUSU>${escapeXml(username)}</NOMUSU>
    <INTERNO>${escapeXml(password)}</INTERNO>
  </requestBody>
</serviceRequest>`;

  try {
    const response = await api.post(
      'services.sbr?serviceName=MobileLoginSP.login',
      xmlRequest,
      { 
        responseType: 'text',
        transformResponse: [(data) => {
          // Verifica se a resposta está vazia
          if (!data || typeof data !== 'string') {
            throw new Error('Resposta vazia do servidor');
          }
          return data;
        }]
      }
    );

    // Verificação mais robusta da resposta
    if (typeof response.data !== 'string') {
      throw new Error('Resposta inválida do servidor: não é texto');
    }

    const result = parser.parse(response.data);

    // Debug: Mostra a resposta completa no console

    if (!result.serviceResponse) {
      throw new Error('Estrutura de resposta inválida');
    }

    if (result.serviceResponse['@_status'] !== "1") {
      const errorMsg = result.serviceResponse?.statusMessage 
        ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
        : 'Credenciais inválidas ou serviço indisponível';
      throw new Error(errorMsg);
    }

    // Verificação mais rigorosa dos dados da sessão
    if (!result.serviceResponse.responseBody || 
        !result.serviceResponse.responseBody.jsessionid ||
        !result.serviceResponse.responseBody.idusu) {
      throw new Error('Dados de sessão incompletos na resposta');
    }

    const sessionData: LoginResponse = {
      jsessionid: result.serviceResponse.responseBody.jsessionid,
      idusu: result.serviceResponse.responseBody.idusu.trim(),
      callID: result.serviceResponse.responseBody.callID || ''
    };

    // Debug: Mostra os dados da sessão

    await AsyncStorage.setItem('sankhya_session', JSON.stringify({
      ...sessionData,
      username,
      timestamp: Date.now()
    }));
    
    return sessionData;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido durante login'
    );
  }
};

export const logout = async (): Promise<void> => {
  try {
    clearInactivityTimer(); // Isso já remove a subscription do AppState
    await api.post('services.sbr?serviceName=MobileLoginSP.logout');
  } catch (error) {
    console.warn('Logout error:', error);
  } finally {
    await AsyncStorage.removeItem('sankhya_session');
  }
};

export const queryJson = async (serviceName: string, requestBody: object): Promise<any> => {
  try {
    const response = await api.post(
      `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=json`,
      { requestBody },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== "1") {
      throw new Error(response.data.statusMessage || 'Erro na requisição');
    }

    return response.data.responseBody;
  } catch (error) {
    console.error('JSON query error:', error);
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido na consulta'
    );
  }
};

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
    serviceName: "CRUDServiceProvider.saveRecord",
    requestBody: {
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
    }
  };

  try {
    const response = await api.post(
      'service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
      requestBody,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== "1") {
      throw new Error(response.data.statusMessage || 'Erro ao salvar');
    }

    return response.data.responseBody;
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

export const deletarConferenciaAPI = async (nunota: number): Promise<any> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="CRUDServiceProvider.deleteRecord">
  <requestBody>
    <dataSet>
      <rootEntity>AD_EXPEDICAODASH</rootEntity>
      <where>
        <condition expression="NUNOTA = ${nunota}"/>
      </where>
    </dataSet>
  </requestBody>
</serviceRequest>`;

  try {
    const response = await api.post(
      'services.sbr?serviceName=CRUDServiceProvider.removeRecord',
      xmlRequest,
      { responseType: 'text', transformResponse: [data => data] }
    );

    const result = parser.parse(response.data);
    
    if (!result.serviceResponse || result.serviceResponse['@_status'] !== "1") {
      throw new Error(result.serviceResponse?.statusMessage || 'Erro ao deletar');
    }

    return result.serviceResponse.responseBody;
  } catch (error) {
    console.error('Delete conference error:', error);
    throw new Error(
      axios.isAxiosError(error)
        ? 'Erro de conexão com o servidor'
        : error instanceof Error
          ? error.message
          : 'Erro desconhecido ao deletar'
    );
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
    const response = await api.post(
      `services.sbr?serviceName=${encodeURIComponent(serviceName)}`,
      xmlRequest,
      { responseType: 'text', transformResponse: [data => data] }
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

export default api;