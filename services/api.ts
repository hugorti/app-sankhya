import axios, { AxiosError } from 'axios';
import { parseString } from 'xml2js';
import { Buffer } from 'buffer';

// Interface completa para a resposta da API
interface SankhyaApiResponse {
  serviceResponse?: {
    $: {
      serviceName: string;
      status: string;
      pendingPrinting: string;
      transactionId: string;
    };
    responseBody?: Array<{
      jsessionid?: string[];
      idusu?: string[];
      callID?: string[];
    }>;
    statusMessage?: string[];
  };
}

interface LoginResponse {
  jsessionid?: string;
  idusu?: string;
  callID?: string;
  error?: string;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const xmlRequest = `<?xml version="1.0" encoding="ISO-8859-1"?>
<serviceRequest serviceName="MobileLoginSP.login">
  <requestBody>
    <NOMUSU>${username}</NOMUSU>
    <INTERNO>${password}</INTERNO>
  </requestBody>
</serviceRequest>`;

  try {
    const response = await axios.post('http://192.168.0.103:8380/mge/services.sbr?serviceName=MobileLoginSP.login', xmlRequest, {
      headers: {
        'Content-Type': 'application/xml; charset=ISO-8859-1',
      },
    });

    return new Promise((resolve, reject) => {
      parseString(response.data, (err: Error | null, result: unknown) => {
        if (err) {
          reject(err);
          return;
        }

        // Verificação de tipo segura
        const apiResponse = result as SankhyaApiResponse;
        
        if (!apiResponse?.serviceResponse) {
          reject(new Error('Resposta da API em formato inválido'));
          return;
        }

        const sr = apiResponse.serviceResponse;

        // Resposta de erro
        if (sr.$?.status === "0") {
          const errorMessage = sr.statusMessage?.[0] 
            ? Buffer.from(sr.statusMessage[0], 'base64').toString('utf-8')
            : 'Erro desconhecido';
          reject(new Error(errorMessage));
          return;
        }

        // Resposta de sucesso
        if (sr.$?.status === "1" && sr.responseBody?.[0]) {
          const rb = sr.responseBody[0];
          resolve({
            jsessionid: rb.jsessionid?.[0],
            idusu: rb.idusu?.[0],
            callID: rb.callID?.[0],
          });
          return;
        }

        reject(new Error('Formato de resposta desconhecido'));
      });
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    
    if (axiosError.response?.data) {
      try {
        const errorResponse = await new Promise<SankhyaApiResponse>((resolve, reject) => {
          parseString(axiosError.response?.data as string, (err, result) => {
            if (err) reject(err);
            else resolve(result as SankhyaApiResponse);
          });
        });

        if (errorResponse.serviceResponse?.statusMessage?.[0]) {
          const errorMsg = Buffer.from(errorResponse.serviceResponse.statusMessage[0], 'base64').toString('utf-8');
          throw new Error(errorMsg);
        }
      } catch (parseError) {
        console.error("Erro ao analisar resposta de erro:", parseError);
      }
    }
    
    throw new Error(axiosError.message || 'Falha na comunicação com o servidor');
  }
};