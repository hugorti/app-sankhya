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
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutos em milissegundos

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
let lastActivityTime: number | null = null;
let onInactiveCallback: (() => Promise<void>) | null = null;
let appStateSubscription: { remove: () => void } | null = null;

// Funções para gerenciar inatividade
export const setupInactivityListener = (callback: () => Promise<void>) => {
  onInactiveCallback = async () => {
    try {
      await logout(true); // Logout automático
      await callback();
    } catch (error) {
      // Garante que a sessão seja removida mesmo com erro
      await AsyncStorage.removeItem('sankhya_session');
      await callback();
    }
  };
  
  // Limpar subscription existente
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // Registrar tempo atual como última atividade
  lastActivityTime = Date.now();

  // Configurar listener do estado do app
  appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // Quando o app volta ao ativo, verificar quanto tempo ficou inativo
      if (lastActivityTime) {
        const inactiveTime = Date.now() - lastActivityTime;
        if (inactiveTime >= INACTIVITY_TIMEOUT) {
          await callback();
        } else {
          // Se ainda não passou o tempo limite, reiniciar o timer
          lastActivityTime = Date.now();
          resetInactivityTimer();
        }
      }
    } else {
      // Quando o app vai para background, limpar o timer
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
  
  // Atualizar o momento da última atividade
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

const configureInterceptors = () => {
  // Request interceptor
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

  // Response interceptor (mantenha o mesmo que já temos)
  api.interceptors.response.use(/* ... */);
};

// Set base URL with validation
export const setBaseURL = async (ipPort: string): Promise<boolean> => {
  try {
    const formattedUrl = formatServerUrl(ipPort);
    
    // Testa a nova URL
    await axios.get(formattedUrl, { timeout: 5000 });
    
    // Atualiza a URL base global
    currentBaseURL = formattedUrl;
    
    // Recria a instância do axios com a nova URL
    recreateApiInstance(currentBaseURL);
    
    // Salva a nova URL
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
      const formattedUrl = formatServerUrl(saved);
      currentBaseURL = formattedUrl;
      recreateApiInstance(currentBaseURL);
    }
  } catch (error) {
    console.error('Failed to initialize API:', error);
    throw error;
  }
};

const recreateApiInstance = (baseUrl: string) => {
  api = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/xml; charset=ISO-8859-1',
      'Accept': 'application/xml'
    }
  });
  configureInterceptors(); // Reconfigura os interceptors
};

// Mude de const para let
let api: AxiosInstance = axios.create({
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
    // Ignora erros de logout
    if (error.config?.url?.includes('MobileLoginSP.logout')) {
      return Promise.reject(error);
    }

    // Trata outros erros
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('sankhya_session');
      clearInactivityTimer();
    } else if (!error.response) {
      // Se não houve resposta, verifica se é erro de rede
      if (error.code === 'ERR_NETWORK') {
        // Mantém a sessão se for erro de réseau (pode ser temporário)
        return Promise.reject(new Error('Erro de conexão. Verifique sua internet.'));
      }
      throw new Error('Erro de comunicação com o servidor');
    }
    
    return Promise.reject(error);
  }
);

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="MobileLoginSP.login">
  <requestBody>
    <NOMUSU>${escapeXml(username)}</NOMUSU>
    <INTERNO>${escapeXml(password)}</INTERNO>
  </requestBody>
</serviceRequest>`;

  try {
    // Limpa qualquer timer pendente
    clearInactivityTimer();
    const response = await api.post(
      'services.sbr?serviceName=MobileLoginSP.login',
      xmlRequest,
      { 
        responseType: 'text',
        transformResponse: [(data) => {
          if (!data || typeof data !== 'string') {
            throw new Error('Resposta vazia do servidor');
          }
          return data;
        }]
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

    const sessionData: LoginResponse = {
      jsessionid: result.serviceResponse.responseBody.jsessionid,
      idusu: result.serviceResponse.responseBody.idusu.trim(),
      callID: result.serviceResponse.responseBody.callID || ''
    };

    await AsyncStorage.setItem('sankhya_session', JSON.stringify({
      ...sessionData,
      username,
      timestamp: Date.now()
    }));
    
        setupInactivityListener(async () => {
      console.log('Sessão expirada por inatividade');
    });

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

export const logout = async (isAutoLogout = false): Promise<void> => {
  try {
    clearInactivityTimer();
    
    // Se for logout automático, tenta apenas uma vez rapidamente
    if (isAutoLogout) {
      await Promise.race([
        api.post('services.sbr?serviceName=MobileLoginSP.logout'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
    } else {
      // Logout manual - tenta normalmente
      await api.post('services.sbr?serviceName=MobileLoginSP.logout');
    }
  } catch (error) {
    // Ignora erros específicos de network/timeout no logout automático
    if (!isAutoLogout || 
        (axios.isAxiosError(error) && error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK')) {
      console.warn('Logout error:', error);
    }
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

// Adicione esta função auxiliar para buscar o IDIATV da operação de EMBALAGEM
const buscarIdiAtvEmbalagem = async (idiproc: number): Promise<number | null> => {
  try {
    const sql = `
      SELECT ATV.IDIATV
      FROM TPRIATV ATV
      JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
      WHERE ATV.IDIPROC = ${idiproc} AND FX.DESCRICAO = 'EMBALAGEM' AND ATV.DHACEITE IS NOT NULL;
    `;
    
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    return result.rows.length > 0 ? result.rows[0][0] : null;
  } catch (error) {
    console.error('Erro ao buscar IDIATV de embalagem:', error);
    return null;
  }
};

// Função auxiliar para buscar CODUSU
export const buscarCodUsu = async (username: string): Promise<number> => {
  try {
    const sql = `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username}'`;
    const result = await queryJson('DbExplorerSP.executeQuery', { sql });
    
    if (result.rows.length > 0) {
      return result.rows[0][0];
    } else {
      throw new Error('Usuário não encontrado na tabela TSIUSU');
    }
  } catch (error) {
    console.error('Erro ao buscar CODUSU:', error);
    throw error;
  }
};

export const buscarDadosAtividadeEmbalagem = async (idiproc: number): Promise<{
    IDIATV: number | null;
    IDEFX: number | null;
    IDIPROC: number | null;
    IDPROC: number | null;
      } | null> => {
    try {
    // Buscar dados da atividade de embalagem
    const sqlAtividade = `
      SELECT ATV.IDIATV, ATV.IDEFX, ATV.IDIPROC
      FROM TPRIATV ATV
      JOIN TPREFX FX ON FX.IDEFX = ATV.IDEFX
      WHERE ATV.IDIPROC = ${idiproc} 
        AND FX.DESCRICAO = 'EMBALAGEM' 
        AND ATV.DHACEITE IS NOT NULL;
    `;
    
    const resultAtividade = await queryJson('DbExplorerSP.executeQuery', { sql: sqlAtividade });
    
    if (resultAtividade.rows.length === 0) {
      return null;
    }

    const atividade = resultAtividade.rows[0];
    const IDIATV = atividade[0];
    const IDEFX = atividade[1];
    const IDIPROC = atividade[2];

    // Buscar IDPROC da tabela TPRIPROC
    const sqlProcesso = `
      SELECT IDPROC 
      FROM TPRIPROC 
      WHERE IDIPROC = ${idiproc};
    `;
    
    const resultProcesso = await queryJson('DbExplorerSP.executeQuery', { sql: sqlProcesso });
    const IDPROC = resultProcesso.rows.length > 0 ? resultProcesso.rows[0][0] : null;

    return {
      IDIATV,
      IDEFX,
      IDIPROC,
      IDPROC
    };

  } catch (error) {
    console.error('Erro ao buscar dados da atividade de embalagem:', error);
    return null;
  }
};

export const iniciarSeparacao = async (data: {
  IDIPROC: number;
  username: string;
}): Promise<any> => {
  try {
    // Buscar o CODUSU com base no username
    const codUsu = await buscarCodUsu(data.username);
    
    // Buscar o IDIATV da operação de EMBALAGEM
    const idiAtv = await buscarIdiAtvEmbalagem(data.IDIPROC);
    
    if (!idiAtv) {
      throw new Error('Não foi encontrada atividade de EMBALAGEM para esta OP');
    }

    // Formatar data e hora atual no formato DD/MM/YYYY HH:MM
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dataHora = `${day}/${month}/${year} ${hours}:${minutes}`;

    // PRIMEIRO: Criar DHINICIO na InstanciaAtividade
    const requestBodyInstancia = {
      serviceName: "CRUDServiceProvider.saveRecord",
      requestBody: {
        dataSet: {
          rootEntity: "InstanciaAtividade",
          includePresentationFields: "N",
          dataRow: {
            localFields: {
              IDIPROC: { "$": data.IDIPROC },
              DHINICIO: { "$": dataHora },
              CODUSU: { "$": codUsu }, 
              CODULTEXEC: { "$": codUsu }, 
            },
            key: {
              IDIATV: { "$": idiAtv }
            }
          },
          entity: {
            fieldset: {
              list: "IDIPROC, DHINICIO, CODUSU, CODULTEXEC"
            }
          }
        }
      }
    };

    // Executar primeira requisição para InstanciaAtividade
    const responseInstancia = await api.post(
      'mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
      requestBodyInstancia,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (responseInstancia.data.status !== "1") {
      throw new Error(responseInstancia.data.statusMessage || 'Erro ao iniciar separação na InstanciaAtividade');
    }

    // Armazenar o timestamp de início para cálculo do tempo gasto
    const inicioTimestamp = now.getTime();

    // SEGUNDO: Criar ExecucaoAtividade com os mesmos dados da Instancia
    const requestBodyExecucao = {
      serviceName: "CRUDServiceProvider.saveRecord",
      requestBody: {
        dataSet: {
          rootEntity: "ExecucaoAtividade",
          includePresentationFields: "N",
          dataRow: {
            localFields: {
              DHINICIO: { "$": dataHora }, // Mesmo DHINICIO da Instancia
              IDIATV: { "$": idiAtv },     // Mesmo IDIATV da Instancia
              CODEXEC: { "$": codUsu },    // CODUSU obtido da TSIUSU
              CODUSU: { "$": codUsu },     // CODUSU obtido da TSIUSU
              TIPO: { "$": "N" },          // Indicando que a execução foi finalizada
              CODMTP: { "$": 0 }           // Código do motivo de finalização (0 = Normal)
            }
          },
          entity: {
            fieldset: {
              list: "IDIATV, DHINICIO, CODEXEC, CODUSU, TIPO, CODMTP"
            }
          }
        }
      }
    };

    // Executar segunda requisição para ExecucaoAtividade
    const responseExecucao = await api.post(
      'mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
      requestBodyExecucao,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (responseExecucao.data.status !== "1") {
      throw new Error(responseExecucao.data.statusMessage || 'Erro ao criar ExecucaoAtividade');
    }

    // Retornar o IDEIATV gerado e o IDIATV para usar no finalizar
    const ideiAtv = responseExecucao.data.responseBody.entities.entity.IDEIATV.$;
    return {
      instanciaAtividade: responseInstancia.data.responseBody,
      execucaoAtividade: responseExecucao.data.responseBody,
      IDEIATV: ideiAtv,
      IDIATV: idiAtv,
      CODUSU: codUsu,
      inicioTimestamp: inicioTimestamp // Armazenar timestamp para cálculo posterior
    };

  } catch (error) {
    console.error('Error starting separation:', error);
    throw error;
  }
};

// FUNÇÃO CORRIGIDA - USANDO SUA API CONFIGURADA
export const finalizarAtividadeEmbalagemComSession = async (data: {
  IDIPROC: number;
  IDEFX: number;
  IDIATV: number;
  IDPROC: number;
  jsessionid: string;
}): Promise<any> => {
  try {
    // FORMATO EXATO QUE FUNCIONA
    const requestBody = {
      serviceName: "OperacaoProducaoSP.finalizarInstanciaAtividades",
      requestBody: {
        instancias: {
          confirmarApontamentosDivergentes: true,
          instancia: [
            {
              IDIATV: { "$": data.IDIATV },
              IDEFX: { "$": data.IDEFX },
              IDIPROC: { "$": data.IDIPROC },
              IDPROC: { "$": data.IDPROC }
            }
          ]
        },
        clientEventList: {
          clientEvent: [
            { "$": "br.com.sankhya.mgeprod.apontamentos.divergentes" },
            { "$": "br.com.sankhya.mgeProd.wc.indisponivel" },
            { "$": "br.com.sankhya.mgeprod.redimensionar.op.pa.perda" },
            { "$": "br.com.sankhya.mgeprod.redimensionar.op.pa.avisos" },
            { "$": "br.com.sankhya.mgeprod.trocaturno.avisos" },
            { "$": "br.com.sankhya.mgeprod.finalizar.liberacao.desvio.pa" },
            { "$": "br.com.sankhya.actionbutton.clientconfirm" },
            { "$": "br.com.sankhya.mgeProd.apontamento.ultimo" },
            { "$": "br.com.sankhya.mgeprod.operacaoproducao.mpalt.proporcao.apontamento.invalida" },
            { "$": "br.com.sankhya.mgeProd.apontamento.liberaNroSerie" },
            { "$": "br.com.sankhya.prod.remove.apontamento.pesagemvolume" },
            { "$": "br.com.sankhya.mgeprod.confirma.ultimo.apontamento.mp.fixo" },
            { "$": "br.com.sankhya.apontamentomp.naoreproporcionalizado" }
          ]
        }
      }
    };

     const url = `mgeprod/service.sbr?serviceName=OperacaoProducaoSP.finalizarInstanciaAtividades&outputType=json&preventTransform=false&mgeSession=${data.jsessionid}`;
    console.log('Enviando requisição para finalizar atividade...');
    
    // USANDO SUA INSTÂNCIA API CONFIGURADA
    const response = await api.post(
      url,
      requestBody,
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('Resposta do servidor:', response.data);

    if (response.data.status !== "1") {
      throw new Error(response.data.statusMessage || 'Erro ao finalizar InstanciaAtividade');
    }

    return response.data.responseBody;

  } catch (error: any) {
    console.error('Error finalizando atividade de embalagem:', error);
    
    // Log mais detalhado do erro
    if (error.response) {
      console.error('Resposta de erro:', error.response.data);
    }
    
    throw error;
  }
};

export const registrarRetiradaAlmoxarifado = async (data: {
  CODPROD: number;
  DESCRPROD: string;
  ESTOQUE: string;
  QTDSEPARADA: string;
  USUARIO: string;
  UNIDADE: string;
  OP: number;
  LOTE: string;
}): Promise<any> => {
  const requestBody = {
    serviceName: "CRUDServiceProvider.saveRecord",
    requestBody: {
      dataSet: {
        rootEntity: "AD_ALMOXARIFEWMS",
        includePresentationFields: "N",
        dataRow: {
          localFields: {
            CODPROD: { "$": data.CODPROD },
            DESCRPROD: { "$": data.DESCRPROD },
            ESTOQUE: { "$": data.ESTOQUE }, // Agora será a quantidade da OP
            QTDSEPARADA: { "$": data.QTDSEPARADA },
            USUARIO: { "$": data.USUARIO },
            UNIDADE: { "$": data.UNIDADE },
            LOTE: { "$": data.LOTE },
            OP: { "$": data.OP }
          }
        },
        entity: {
          fieldset: {
            list: "CODPROD,DESCRPROD,ESTOQUE,QTDSEPARADA,USUARIO,OP,UNIDADE"
          }
        }
      }
    }
  };

  try {
    const response = await api.post(
      'mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json',
      requestBody,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.status !== "1") {
      throw new Error(response.data.statusMessage || 'Erro ao registrar retirada');
    }

    return response.data.responseBody;
  } catch (error) {
    console.error('Error registering withdrawal:', error);
    throw error;
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