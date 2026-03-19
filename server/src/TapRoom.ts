import { randomBytes } from 'crypto';
import { Player } from './Player';
import { config } from './config';
import type { PlayerInfo, ServerMessage, RoomStateMsg } from '../../shared/protocol';

function secureRandom(): number {
  return randomBytes(4).readUInt32BE() / 0x100000000;
}

type Phase = 'BETTING' | 'RUNNING' | 'ENDED' | 'RESULT';

interface RoundPlayer {
  player: Player;
  bet: number;
  tapCount: number;
  lastTapTime: number;
}

export class TapRoom {
  private players = new Map<string, Player>();
  private roundPlayers = new Map<string, RoundPlayer>();

  phase: Phase = 'BETTING';
  private bettingEndTime = 0;
  private phaseEndTime = 0;

  private elapsed = 0;
  private hiddenDuration = 0;
  private roundStartTime = 0;

  private pot = 0;
  private roundNumber = 0;
  private history: number[] = [];

  private lastTapperId: string | null = null;
  private lastTapperName: string | null = null;
  private winnerPayout = 0;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private readonly TICK_MS = 50;

  addPlayer(player: Player) {
    this.players.set(player.id, player);
    player.currentRoom = 'tap';

    if (this.players.size === 1 && !this.tickInterval) {
      this.startGameLoop();
    }

    player.send(this.buildRoomState());
    this.broadcastExcept({ type: 'playerJoined', player: this.toPlayerInfo(player) }, player.id);
  }

  removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;

    if (this.phase === 'BETTING' && this.roundPlayers.has(playerId)) {
      this.refundBet(playerId);
    }

    this.players.delete(playerId);
    this.roundPlayers.delete(playerId);
    player.currentRoom = null;
    this.broadcast({ type: 'playerLeft', playerId });

    if (this.players.size === 0) this.stopGameLoop();
  }

  placeBet(playerId: string): boolean {
    if (this.phase !== 'BETTING') return false;
    const player = this.players.get(playerId);
    if (!player || this.roundPlayers.has(playerId)) return false;

    const bet = config.tap.entryFee;
    if (player.balance < bet) return false;

    player.balance -= bet;
    this.pot += bet;

    this.roundPlayers.set(playerId, { player, bet, tapCount: 0, lastTapTime: -1 });

    player.send({ type: 'balanceUpdate', balance: player.balance });
    this.broadcast({ type: 'betPlaced', playerId, nickname: player.nickname, pot: this.pot });
    return true;
  }

  tap(playerId: string): boolean {
    if (this.phase !== 'RUNNING') return false;
    const rp = this.roundPlayers.get(playerId);
    if (!rp) return false;

    if (rp.lastTapTime >= 0 && this.elapsed - rp.lastTapTime < config.tap.tapCooldownSec) return false;

    if (rp.tapCount > 0) {
      if (rp.player.balance < config.tap.tapCost) return false;
      rp.player.balance -= config.tap.tapCost;
      this.pot += config.tap.tapCost;
      rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
    }

    rp.tapCount++;
    rp.lastTapTime = this.elapsed;
    this.lastTapperId = playerId;
    this.lastTapperName = rp.player.nickname;

    this.broadcast({
      type: 'playerTapped', playerId,
      nickname: rp.player.nickname,
      tapTime: this.elapsed,
      tapCount: rp.tapCount,
      pot: this.pot,
    });
    return true;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  // ── Game loop ──

  private startGameLoop() {
    this.startBettingPhase();
    this.tickInterval = setInterval(() => this.tick(), this.TICK_MS);
  }

  private stopGameLoop() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.phase = 'BETTING';
    this.pot = 0;
    this.roundPlayers.clear();
  }

  private tick() {
    const now = Date.now();
    switch (this.phase) {
      case 'BETTING':
        if (now >= this.bettingEndTime) this.startRound();
        break;
      case 'RUNNING':
        this.tickRunning(now);
        break;
      case 'ENDED':
        if (now >= this.phaseEndTime) this.showResult();
        break;
      case 'RESULT':
        if (now >= this.phaseEndTime) this.startBettingPhase();
        break;
    }
  }

  private tickRunning(now: number) {
    this.elapsed = (now - this.roundStartTime) / 1000;

    if (this.elapsed >= this.hiddenDuration) {
      this.elapsed = this.hiddenDuration;
      this.onEnded(now);
      return;
    }

    this.broadcast({ type: 'tick', elapsed: this.elapsed, pot: this.pot });
  }

  // ── Phase transitions ──

  private startBettingPhase() {
    this.phase = 'BETTING';
    this.roundPlayers.clear();
    this.lastTapperId = null;
    this.lastTapperName = null;
    this.winnerPayout = 0;
    this.bettingEndTime = Date.now() + config.tap.bettingDelaySec * 1000;

    this.broadcast({
      type: 'phaseChange', phase: 'BETTING',
      bettingTimeLeft: config.tap.bettingDelaySec,
    });
  }

  private startRound() {
    if (this.roundPlayers.size === 0) {
      this.startBettingPhase();
      return;
    }

    this.roundNumber++;
    this.phase = 'RUNNING';
    this.elapsed = 0;
    this.roundStartTime = Date.now();
    this.hiddenDuration = this.generateDuration();
    this.lastTapperId = null;
    this.lastTapperName = null;

    this.broadcast({ type: 'phaseChange', phase: 'RUNNING' });
  }

  private onEnded(now: number) {
    this.phase = 'ENDED';
    this.history.push(parseFloat(this.hiddenDuration.toFixed(1)));
    if (this.history.length > config.history.maxEntries) this.history.shift();

    if (this.lastTapperId) {
      this.winnerPayout = this.pot * (1 - config.tap.casinoCut);
    }

    this.broadcast({ type: 'phaseChange', phase: 'ENDED', duration: this.hiddenDuration });
    this.phaseEndTime = now + config.tap.endedDisplaySec * 1000;
  }

  private showResult() {
    this.phase = 'RESULT';

    if (this.lastTapperId) {
      const rp = this.roundPlayers.get(this.lastTapperId);
      if (rp) {
        rp.player.balance += this.winnerPayout;
        rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
      }
      this.pot = 0;
    }

    for (const [, player] of this.players) {
      if (player.balance < config.player.rebuyThreshold) {
        player.balance = config.player.rebuyAmount;
        player.send({ type: 'balanceUpdate', balance: player.balance });
      }
    }

    this.broadcast({
      type: 'roundResult',
      winnerId: this.lastTapperId,
      winnerName: this.lastTapperName,
      winnerCashoutAmount: 0,
      potWon: this.winnerPayout,
      duration: this.hiddenDuration,
    });

    this.phaseEndTime = Date.now() + config.tap.resultDelaySec * 1000;
  }

  // ── Helpers ──

  private generateDuration(): number {
    const r = secureRandom();
    const { timerMin, timerMax } = config.tap;
    const raw = timerMin / (1 - r);
    return Math.min(Math.max(raw, timerMin), timerMax);
  }

  private refundBet(playerId: string) {
    const rp = this.roundPlayers.get(playerId);
    if (!rp) return;
    rp.player.balance += rp.bet;
    this.pot -= rp.bet;
    rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
    this.roundPlayers.delete(playerId);
    this.broadcast({ type: 'betPlaced', playerId, nickname: rp.player.nickname, pot: this.pot });
  }

  private toPlayerInfo(player: Player): PlayerInfo {
    const rp = this.roundPlayers.get(player.id);
    return {
      id: player.id, nickname: player.nickname,
      inRound: !!rp,
      tapCount: rp?.tapCount, lastTapTime: rp?.lastTapTime,
    };
  }

  private buildRoomState(): RoomStateMsg {
    const players: PlayerInfo[] = [];
    for (const [, p] of this.players) players.push(this.toPlayerInfo(p));
    const bettingTimeLeft = this.phase === 'BETTING'
      ? Math.max(0, (this.bettingEndTime - Date.now()) / 1000) : undefined;

    return {
      type: 'roomState', mode: 'tap', phase: this.phase,
      players, pot: this.pot, roundNumber: this.roundNumber,
      history: this.history, bettingTimeLeft,
      elapsed: this.elapsed,
      lastTapperId: this.lastTapperId,
      lastTapperName: this.lastTapperName,
    };
  }

  private broadcast(msg: ServerMessage) {
    for (const [, player] of this.players) player.send(msg);
  }

  private broadcastExcept(msg: ServerMessage, excludeId: string) {
    for (const [id, player] of this.players) {
      if (id !== excludeId) player.send(msg);
    }
  }
}
