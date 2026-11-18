// types/navigation.d.ts
import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  login: undefined;
  '(tabs)': undefined;
  expedicao: undefined;
  separacao: undefined;
  conferenciaList: {
    nuseparacao: number;
    totalVolumes: number;
    ordemCarga: number;
    nunota: string;
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}