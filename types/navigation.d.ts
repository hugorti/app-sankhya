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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}