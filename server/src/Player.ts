import { WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/protocol';

export class Player {
  id: string;
  nickname: string;
  balance: number;
  ws: WebSocket;
  currentRoom: string | null = null;

  constructor(id: string, ws: WebSocket, startingBalance: number) {
    this.id = id;
    this.nickname = `Player${id.slice(0, 4)}`;
    this.balance = startingBalance;
    this.ws = ws;
  }

  send(msg: ServerMessage) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
