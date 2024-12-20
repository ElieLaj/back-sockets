export interface CustomWebSocket extends WebSocket {
  on(event: string, listener: (data: any) => void): this;
  id: string;
  username: string;
}

export interface PlayerWebSocket extends WebSocket {
  on(event: string, listener: (data: any) => void): this;
  id: string;
  username: string;
  score: number;
}