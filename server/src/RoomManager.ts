import { CrashRoom } from './CrashRoom';
import { TapRoom } from './TapRoom';
import { Player } from './Player';
import type { GameMode } from '../../shared/protocol';

export class RoomManager {
  readonly crashRoom = new CrashRoom();
  readonly tapRoom = new TapRoom();

  joinRoom(player: Player, mode: GameMode): boolean {
    if (mode !== 'crash' && mode !== 'tap') return false;
    this.leaveCurrentRoom(player);
    if (mode === 'crash') {
      this.crashRoom.addPlayer(player);
    } else {
      this.tapRoom.addPlayer(player);
    }
    return true;
  }

  leaveCurrentRoom(player: Player) {
    if (player.currentRoom === 'crash') {
      this.crashRoom.removePlayer(player.id);
    } else if (player.currentRoom === 'tap') {
      this.tapRoom.removePlayer(player.id);
    }
  }

  placeBet(player: Player): boolean {
    if (player.currentRoom === 'crash') return this.crashRoom.placeBet(player.id);
    if (player.currentRoom === 'tap') return this.tapRoom.placeBet(player.id);
    return false;
  }

  cashout(player: Player): boolean {
    if (player.currentRoom === 'crash') return this.crashRoom.cashout(player.id);
    return false;
  }

  tap(player: Player): boolean {
    if (player.currentRoom === 'tap') return this.tapRoom.tap(player.id);
    return false;
  }
}
