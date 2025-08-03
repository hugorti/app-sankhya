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
  //baseURL: 'http://45.186.217.65:8180/mge/',
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
// services/api.ts (apenas a parte relevante modificada)
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

    // Removido o console.log da resposta bruta

    if (typeof response.data !== 'string' || !response.data.includes('serviceResponse')) {
      throw new Error('Resposta inválida do servidor');
    }

    const result = parser.parse(response.data);

    if (!result.serviceResponse || result.serviceResponse['@_status'] !== "1") {
      throw new Error('Credenciais inválidas'); // Mensagem genérica
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
    // Simplificando o tratamento de erro
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Servidor não respondeu. Verifique sua conexão.');
      }
      throw new Error('Erro ao conectar ao servidor');
    }
    throw new Error('Credenciais inválidas'); // Mensagem padrão para outros erros
  }
};

export const logout = async (): Promise<void> => {
  try {
    await api.post('services.sbr?serviceName=MobileLoginSP.logout');
  } catch (error) {
    console.warn('Erro durante logout remoto:', error);
  }
};

// Lista /api.ts
export const queryJson = async (serviceName: string, requestBody: object): Promise<any> => {
  const response = await api.post(
    `service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=json`,
    {
      requestBody: requestBody // Envolva o corpo da requisição em requestBody
    },
    {
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );

  if (response.data.status !== "1") {
    const errorMsg = response.data.statusMessage || 'Erro na requisição';
    throw new Error(typeof errorMsg === 'string' ? errorMsg : 'Erro desconhecido');
  }

  return response.data.responseBody;
};

// Adicione esta nova função no seu arquivo de serviços (api.ts)
export const salvarConferenciaAPI = async (data: {
  NUNOTA: number;
  ORDEMCARGA: number;
  CONFERENTE: string;
  DESCRICAO: string;
  VOLUMES: string | number;
  COMPLETA: boolean;
}) => {
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
            SITUACAO: { "$": situacao } // Adicione esta linha
          }
        },
        entity: {
          fieldset: {
            list: "CODIGO,NUNOTA,CONFERENTE,VOLUMES,SITUACAO" // Atualize esta linha
          }
        }
      }
    }
  };

  const response = await api.post(
    'service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );

  return response.data;
};

// Adicione esta função no seu services/api.ts
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
      {
        responseType: 'text',
        transformResponse: [data => data]
      }
    );

    const result = parser.parse(response.data);
    
    if (!result.serviceResponse || result.serviceResponse['@_status'] !== "1") {
      throw new Error('Erro ao deletar conferência');
    }

    return result.serviceResponse.responseBody;
  } catch (error) {
    console.error('Erro ao deletar conferência:', error);
    throw new Error('Erro ao deletar conferência');
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