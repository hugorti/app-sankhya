// types/navigation.d.ts
import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  login: undefined;
  '(tabs)': undefined;
  expedicao: undefined;
  conferenciaList: {
    nuseparacao: number;
    totalVolumes: number;
    ordemCarga: number;
    nunota: string;
  };
  almoxarife: undefined;
  romaneio: undefined;
  resumoSeparacao: {
    itensSeparados: string;
    idiproc: string;
    codemp: string;
    referencia?: string;
    produto?: string;
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}