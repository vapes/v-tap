import { Player } from './Player';
import type { ServerMessage } from '../../shared/protocol';

export class BotPlayer extends Player {
  readonly isBot = true;

  constructor(id: string, nickname: string, startingBalance: number) {
    super(id, null as any, startingBalance);
    this.nickname = nickname;
  }

  override send(_msg: ServerMessage): void {
    // no-op: bots don't have a real WebSocket
  }
}
