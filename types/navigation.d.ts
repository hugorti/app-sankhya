// types/navigation.d.ts
import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  login: undefined;
  '(tabs)': undefined;
  separacao: undefined;
  conferencia: {
    nuseparacao: number;
    totalVolumes: number;
    ordemCarga: number;
    nunota: string;
  };
  estoque: undefined;
  romaneio: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}