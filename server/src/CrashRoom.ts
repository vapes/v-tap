import { Player } from './Player';
import { config } from './config';
import type { PlayerInfo, ServerMessage, RoomStateMsg } from '../../shared/protocol';

type Phase = 'BETTING' | 'RUNNING' | 'CRASHED' | 'RESULT';

interface RoundPlayer {
  player: Player;
  bet: number;
  wager: number;
  cashedOut: boolean;
  cashoutMultiplier: number;
  cashoutAmount: number;
}

export class CrashRoom {
  private players = new Map<string, Player>();
  private roundPlayers = new Map<string, RoundPlayer>();

  phase: Phase = 'BETTING';
  private bettingEndTime = 0;
  private phaseEndTime = 0;

  private multiplier = 1.0;
  private crashPoint = 1.0;
  private growthRate = 0.2;
  private elapsed = 0;
  private roundStartTime = 0;

  private pot = 0;
  private soloRound = false;
  private roundNumber = 0;
  private history: number[] = [];

  private lastWinnerId: string | null = null;
  private lastWinnerName: string | null = null;
  private lastWinnerCashoutAmount = 0;
  private lastPotWon = 0;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private readonly TICK_MS = 50;

  addPlayer(player: Player) {
    this.players.set(player.id, player);
    player.currentRoom = 'crash';

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

    const bet = config.crash.fixedBet;
    if (player.balance < bet) return false;

    player.balance -= bet;
    const wager = bet - config.crash.potContribution;
    this.pot += config.crash.potContribution;

    this.roundPlayers.set(playerId, {
      player, bet, wager,
      cashedOut: false, cashoutMultiplier: 0, cashoutAmount: 0,
    });

    player.send({ type: 'balanceUpdate', balance: player.balance });
    this.broadcast({ type: 'betPlaced', playerId, nickname: player.nickname, pot: this.pot });
    return true;
  }

  cashout(playerId: string): boolean {
    if (this.phase !== 'RUNNING') return false;
    const rp = this.roundPlayers.get(playerId);
    if (!rp || rp.cashedOut) return false;

    rp.cashedOut = true;
    rp.cashoutMultiplier = this.multiplier;
    rp.cashoutAmount = this.soloRound ? rp.bet * this.multiplier : rp.wager * this.multiplier;
    rp.player.balance += rp.cashoutAmount;

    rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
    this.broadcast({
      type: 'playerCashedOut', playerId,
      nickname: rp.player.nickname,
      multiplier: this.multiplier,
      cashoutAmount: rp.cashoutAmount,
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
      case 'CRASHED':
        if (now >= this.phaseEndTime) this.showResult();
        break;
      case 'RESULT':
        if (now >= this.phaseEndTime) this.startBettingPhase();
        break;
    }
  }

  private tickRunning(now: number) {
    this.elapsed = (now - this.roundStartTime) / 1000;
    this.multiplier = Math.exp(this.elapsed * this.growthRate);

    if (this.multiplier >= this.crashPoint) {
      this.multiplier = this.crashPoint;
      this.onCrash(now);
      return;
    }

    this.broadcast({ type: 'tick', elapsed: this.elapsed, multiplier: this.multiplier, pot: this.pot });
  }

  // ── Phase transitions ──

  private startBettingPhase() {
    this.phase = 'BETTING';
    this.roundPlayers.clear();
    this.soloRound = false;
    this.lastWinnerId = null;
    this.lastWinnerName = null;
    this.lastWinnerCashoutAmount = 0;
    this.lastPotWon = 0;
    this.bettingEndTime = Date.now() + config.timing.bettingDelaySec * 1000;

    this.broadcast({
      type: 'phaseChange', phase: 'BETTING',
      bettingTimeLeft: config.timing.bettingDelaySec,
    });
  }

  private startRound() {
    if (this.roundPlayers.size === 0) {
      this.startBettingPhase();
      return;
    }

    if (this.roundPlayers.size === 1) {
      this.soloRound = true;
      const [, rp] = [...this.roundPlayers.entries()][0];
      this.pot -= config.crash.potContribution;
      rp.wager = rp.bet;
    }

    this.roundNumber++;
    this.phase = 'RUNNING';
    this.multiplier = 1.0;
    this.elapsed = 0;
    this.roundStartTime = Date.now();
    this.crashPoint = this.generateCrashPoint();
    this.growthRate = config.growth.rateMin + Math.random() * (config.growth.rateMax - config.growth.rateMin);

    this.broadcast({ type: 'phaseChange', phase: 'RUNNING', growthRate: this.growthRate });
  }

  private onCrash(now: number) {
    this.phase = 'CRASHED';
    this.history.push(parseFloat(this.crashPoint.toFixed(2)));
    if (this.history.length > config.history.maxEntries) this.history.shift();

    this.determineWinner();
    this.broadcast({ type: 'phaseChange', phase: 'CRASHED', crashPoint: this.crashPoint });
    this.phaseEndTime = now + config.timing.crashDisplaySec * 1000;
  }

  private showResult() {
    this.phase = 'RESULT';

    if (!this.soloRound && this.lastWinnerId) {
      const rp = this.roundPlayers.get(this.lastWinnerId);
      if (rp) {
        this.lastPotWon = this.pot;
        rp.player.balance += this.pot;
        rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
      }
      this.pot = 0;
    } else if (this.soloRound) {
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
      winnerId: this.lastWinnerId,
      winnerName: this.lastWinnerName,
      winnerCashoutAmount: this.lastWinnerCashoutAmount,
      potWon: this.lastPotWon,
      crashPoint: this.crashPoint,
    });

    this.phaseEndTime = Date.now() + config.timing.resultDelaySec * 1000;
  }

  // ── Helpers ──

  private determineWinner() {
    let best: RoundPlayer | null = null;
    for (const [, rp] of this.roundPlayers) {
      if (rp.cashedOut && (!best || rp.cashoutMultiplier > best.cashoutMultiplier)) {
        best = rp;
      }
    }
    if (best) {
      this.lastWinnerId = best.player.id;
      this.lastWinnerName = best.player.nickname;
      this.lastWinnerCashoutAmount = best.cashoutAmount;
    }
  }

  private generateCrashPoint(): number {
    const r = Math.random();
    const { houseEdge, minMultiplier, maxMultiplier } = config.crash;
    const raw = (1 - houseEdge) / (1 - r);
    return Math.min(Math.max(raw, minMultiplier), maxMultiplier);
  }

  private refundBet(playerId: string) {
    const rp = this.roundPlayers.get(playerId);
    if (!rp) return;
    rp.player.balance += rp.bet;
    this.pot -= config.crash.potContribution;
    rp.player.send({ type: 'balanceUpdate', balance: rp.player.balance });
    this.roundPlayers.delete(playerId);
    this.broadcast({ type: 'betPlaced', playerId, nickname: rp.player.nickname, pot: this.pot });
  }

  private toPlayerInfo(player: Player): PlayerInfo {
    const rp = this.roundPlayers.get(player.id);
    return {
      id: player.id, nickname: player.nickname, inRound: !!rp,
      cashedOut: rp?.cashedOut, cashoutMultiplier: rp?.cashoutMultiplier,
      cashoutAmount: rp?.cashoutAmount,
    };
  }

  private buildRoomState(): RoomStateMsg {
    const players: PlayerInfo[] = [];
    for (const [, p] of this.players) players.push(this.toPlayerInfo(p));
    const bettingTimeLeft = this.phase === 'BETTING'
      ? Math.max(0, (this.bettingEndTime - Date.now()) / 1000) : undefined;

    return {
      type: 'roomState', mode: 'crash', phase: this.phase,
      players, pot: this.pot, roundNumber: this.roundNumber,
      history: this.history, bettingTimeLeft,
      multiplier: this.multiplier, growthRate: this.growthRate, elapsed: this.elapsed,
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
