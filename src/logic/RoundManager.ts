import mathConfig from '../math-config.json';

export enum GameState {
  BETTING  = 'BETTING',
  RUNNING  = 'RUNNING',
  CRASHED  = 'CRASHED',
  RESULT   = 'RESULT',
}

export interface CashoutEntry {
  name: string;
  multiplier: number;
  isPlayer: boolean;
  cashoutAmount: number; // wager × multiplier payout
}

export class RoundManager {
  state: GameState = GameState.BETTING;

  multiplier     = 1.0;
  crashMultiplier = 1.0;

  private elapsedTime = 0;
  private growthRate  = 0.2;

  /** Persistent pot — accumulates across rounds until someone wins it */
  potValue = 0;

  cashouts: CashoutEntry[] = [];

  /** Whether the player chose to bet this round */
  playerInRound               = false;
  playerCashedOut             = false;
  playerCashoutMultiplier     = 0;
  playerBalance               = mathConfig.player.startingBalance;
  playerBet                   = 0;
  /** Wager portion: bet minus $1 pot contribution */
  playerWager                 = 0;
  /** Cashout payout held until the fly animation completes */
  playerPendingCashoutAmount  = 0;

  tableBet = 0;

  roundNumber  = 0;
  lastWinner: CashoutEntry | null = null;
  recentCrashes: number[]         = [];

  private generateCrashPoint(): number {
    const r = Math.random();
    const { houseEdge, minMultiplier, maxMultiplier } = mathConfig.crash;
    const raw = (1 - houseEdge) / (1 - r);
    return Math.min(Math.max(raw, minMultiplier), maxMultiplier);
  }

  startBetting() {
    this.state          = GameState.BETTING;
    this.playerInRound  = false;
    this.playerCashedOut = false;
  }

  /** Player taps BET during the betting window. Returns true if successful. */
  playerJoinRound(): boolean {
    if (this.playerInRound || this.state !== GameState.BETTING) return false;
    if (this.playerBalance < this.tableBet) return false;

    this.playerBalance -= this.tableBet;
    this.playerBet      = this.tableBet;
    this.playerWager    = this.tableBet - mathConfig.player.potContribution;
    this.potValue      += mathConfig.player.potContribution;
    this.playerInRound  = true;
    return true;
  }

  /** A bot joins the round during betting. Call once per bot bet. */
  botJoinRound(_betAmount: number) {
    this.potValue += mathConfig.player.potContribution;
  }

  startRound() {
    this.roundNumber++;
    this.state                  = GameState.RUNNING;
    this.multiplier             = 1.0;
    this.elapsedTime            = 0;
    this.crashMultiplier        = this.generateCrashPoint();
    this.cashouts               = [];
    this.playerCashedOut        = false;
    this.playerCashoutMultiplier = 0;
    this.lastWinner             = null;

    const { rateMin, rateMax } = mathConfig.growth;
    this.growthRate = rateMin + Math.random() * (rateMax - rateMin);
  }

  update(dt: number): boolean {
    if (this.state !== GameState.RUNNING) return false;

    this.elapsedTime += dt;
    this.multiplier = Math.exp(this.elapsedTime * this.growthRate);

    if (this.multiplier >= this.crashMultiplier) {
      this.multiplier = this.crashMultiplier;
      this.state      = GameState.CRASHED;
      this.recentCrashes.push(parseFloat(this.crashMultiplier.toFixed(2)));
      if (this.recentCrashes.length > mathConfig.crashHistory.maxEntries) {
        this.recentCrashes.shift();
      }
      this.determineWinner();
      return true;
    }
    return false;
  }

  addCashout(entry: CashoutEntry) {
    this.cashouts.push(entry);
  }

  playerCashout(): number {
    if (!this.playerInRound || this.playerCashedOut || this.state !== GameState.RUNNING) return 0;
    this.playerCashedOut            = true;
    this.playerCashoutMultiplier    = this.multiplier;
    const cashoutAmount             = this.playerWager * this.multiplier;
    this.playerPendingCashoutAmount = cashoutAmount; // applied after fly animation
    this.addCashout({ name: 'YOU', multiplier: this.multiplier, isPlayer: true, cashoutAmount });
    return this.multiplier;
  }

  /** Flush deferred cashout payout into player balance (call when fly animation lands). */
  applyPendingCashout() {
    if (this.playerPendingCashoutAmount > 0) {
      this.playerBalance             += this.playerPendingCashoutAmount;
      this.playerPendingCashoutAmount = 0;
    }
  }

  /** Award pot to winner; pot resets. Handles player rebuy if needed. */
  awardPot() {
    if (this.lastWinner?.isPlayer) {
      this.playerBalance += this.potValue;
    }
    this.potValue = 0;

    if (this.playerBalance < mathConfig.player.rebuyThreshold) {
      this.playerBalance = mathConfig.player.rebuyAmount;
    }
  }

  private determineWinner() {
    this.lastWinner = this.cashouts.length > 0
      ? this.cashouts[this.cashouts.length - 1]
      : null;
  }

  setTableBet(bet: number) {
    this.tableBet = bet;
  }

  showResult() {
    this.state = GameState.RESULT;
  }

  resetForLobby() {
    this.state                      = GameState.BETTING;
    this.roundNumber                = 0;
    this.recentCrashes              = [];
    this.tableBet                   = 0;
    this.potValue                   = 0;
    this.playerPendingCashoutAmount = 0;
    this.playerBalance              = mathConfig.player.startingBalance;
  }
}
