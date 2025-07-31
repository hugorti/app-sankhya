// services/api.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Buffer } from 'buffer';
import { XMLParser } from 'fast-xml-parser';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Configuração base do axios
const api: AxiosInstance = axios.create({
  baseURL: 'http://179.127.28.188:55180/mge/',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/xml; charset=ISO-8859-1',
    'Accept': 'application/xml'
  }
});

// Interceptador para incluir o JSESSIONID automaticamente
api.interceptors.request.use(async (config) => {
  const session = await AsyncStorage.getItem('sankhya_session');
  if (session) {
    const { jsessionid } = JSON.parse(session);
    if (jsessionid) {
      config.headers.Cookie = `JSESSIONID=${jsessionid}`;
    }
  }
  return config;
});

// Interceptador para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Sessão expirada - limpa o storage e redireciona
      AsyncStorage.removeItem('sankhya_session');
      // Você pode adicionar um evento global ou usar React Navigation para redirecionar
    }
    return Promise.reject(error);
  }
);

/**
 * Realiza o login no sistema Sankhya
 * @param username Nome de usuário
 * @param password Senha
 * @returns Objeto com dados da sessão
 */
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
        transformResponse: [data => data]
      }
    );

    console.log('Resposta bruta:', response.data);

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

    if (!result.serviceResponse.responseBody) {
      throw new Error('Estrutura de resposta incompleta');
    }

    return {
      jsessionid: result.serviceResponse.responseBody.jsessionid || '',
      idusu: (result.serviceResponse.responseBody.idusu || '').trim(),
      callID: result.serviceResponse.responseBody.callID || ''
    };

  } catch (error) {
    console.error('Erro detalhado:', error);
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout: O servidor não respondeu a tempo');
      }
      throw new Error(`Erro de conexão: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Realiza logout no sistema Sankhya
 */
export const logout = async (): Promise<void> => {
  try {
    await api.post('services.sbr?serviceName=MobileLoginSP.logout');
  } catch (error) {
    console.warn('Erro durante logout remoto:', error);
  }
};

/**
 * Método genérico para consultas ao Sankhya
 * @param serviceName Nome do serviço
 * @param requestBody Corpo da requisição em XML
 */
export const query = async (serviceName: string, requestBody: string): Promise<any> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="${escapeXml(serviceName)}">
  <requestBody>
    ${requestBody}
  </requestBody>
</serviceRequest>`;

  const response = await api.post(
    `services.sbr?serviceName=${encodeURIComponent(serviceName)}`,
    xmlRequest,
    {
      responseType: 'text',
      transformResponse: [data => data]
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
};

/**
 * Escapa caracteres especiais para XML
 */
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

export default api;