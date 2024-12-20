import { PlayerWebSocket } from './websocket';

export interface Game {
  id: string;
  players: PlayerWebSocket[];
  state: string;
}

export interface SketchGames extends Game {
  word: string;
  owner: PlayerWebSocket;
  drawer?: PlayerWebSocket;
  drawOrder: PlayerWebSocket[];
  round: number;
  maxRound: number;
  roundDuration: number;
  winner?: PlayerWebSocket;
  roundWinners: PlayerWebSocket[];
  canvas: any;
  writtingUsers: PlayerWebSocket[];
  typingTimeouts: {}
}