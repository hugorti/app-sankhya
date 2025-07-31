export interface SankhyaSession {
  jsessionid: string;
  idusu: string;
  callID: string;
  username?: string;
  timestamp?: number;
}

export interface LoginResult {
  jsessionid: string;
  idusu: string;
  callID: string;
}