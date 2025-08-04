// services/api.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Buffer } from 'buffer';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'saved_server_url';
const DEFAULT_IP = '';
const DEFAULT_PORT = '8180';
const DEFAULT_URL = `${DEFAULT_IP}:${DEFAULT_PORT}`;

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

// Helper function to validate and format server URL
const formatServerUrl = (ipPort: string): string => {
  // Remove protocol if present
  ipPort = ipPort.replace(/^https?:\/\//, '');
  
  // Split IP and port
  let [ip, port] = ipPort.split(':');
  
  // Clean IP and port
  ip = ip.replace(/\/+$/, '').trim();
  port = (port || DEFAULT_PORT).replace(/\/+$/, '').trim();
  
  // Validate IP format (simple validation)
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-zA-Z0-9\-\.]+$/.test(ip)) {
    throw new Error('Formato de IP inválido');
  }
  
  // Validate port
  if (!/^\d+$/.test(port)) {
    throw new Error('Porta inválida');
  }

  return `http://${ip}:${port}/mge/`;
};

// Set base URL with validation
export const setBaseURL = async (ipPort: string): Promise<boolean> => {
  try {
    const formattedUrl = formatServerUrl(ipPort);
    
    // Test connection
    await axios.get(formattedUrl, { timeout: 5000 });
    
    // Update current URL
    currentBaseURL = formattedUrl;
    api.defaults.baseURL = currentBaseURL;
    
    // Save only the clean ip:port
    const cleanIpPort = ipPort.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanIpPort);
    
    return true;
  } catch (error) {
    console.error('URL configuration error:', error);
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
    console.error('API initialization error:', error);
    // Fallback to default URL
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
    }
    return config;
  } catch (error) {
    console.error('Request interceptor error:', error);
    return config;
  }
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('sankhya_session');
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

// Login function with improved error handling
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
      { responseType: 'text', transformResponse: [data => data] }
    );

    if (typeof response.data !== 'string' || !response.data.includes('serviceResponse')) {
      throw new Error('Resposta inválida do servidor');
    }

    const result = parser.parse(response.data);

    if (!result.serviceResponse || result.serviceResponse['@_status'] !== "1") {
      const errorMsg = result.serviceResponse?.statusMessage 
        ? Buffer.from(result.serviceResponse.statusMessage, 'base64').toString('utf-8')
        : 'Credenciais inválidas';
      throw new Error(errorMsg);
    }

    const sessionData = {
      jsessionid: result.serviceResponse.responseBody.jsessionid || '',
      idusu: (result.serviceResponse.responseBody.idusu || '').trim(),
      callID: result.serviceResponse.responseBody.callID || ''
    };

    await AsyncStorage.setItem('sankhya_session', JSON.stringify(sessionData));
    
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