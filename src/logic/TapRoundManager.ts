import mathConfig from '../math-config.json';

export enum TapGameState {
  BETTING = 'BETTING',
  RUNNING = 'RUNNING',
  ENDED   = 'ENDED',
  RESULT  = 'RESULT',
}

export interface TapEntry {
  name:     string;
  isPlayer: boolean;
  tapTime:  number;
}

export class TapRoundManager {
  state: TapGameState = TapGameState.BETTING;

  elapsedTime     = 0;
  private hiddenDuration = 0;

  potValue     = 0;
  roundNumber  = 0;

  entryFee = mathConfig.tap.entryFee;
  tapCost  = mathConfig.tap.tapCost;

  playerBalance     = mathConfig.player.startingBalance;
  playerInRound     = false;
  playerTapCount    = 0;
  playerLastTapTime = -1;

  tapCounts = new Map<string, number>();
  private lastTapTimes = new Map<string, number>();
  lastTapper: TapEntry | null = null;

  /** Full history of taps in order */
  tapHistory: TapEntry[] = [];

  /** Winner gets pot * (1 - casinoCut) */
  winnerPayout = 0;
  recentDurations: number[] = [];

  startBetting() {
    this.state          = TapGameState.BETTING;
    this.playerInRound  = false;
    this.playerTapCount = 0;
    this.tapCounts.clear();
    this.lastTapTimes.clear();
    this.lastTapper  = null;
    this.tapHistory  = [];
    this.winnerPayout = 0;
  }

  playerJoinRound(): boolean {
    if (this.playerInRound || this.state !== TapGameState.BETTING) return false;
    if (this.playerBalance < this.entryFee) return false;

    this.playerBalance -= this.entryFee;
    this.potValue      += this.entryFee;
    this.playerInRound  = true;
    return true;
  }

  botJoinRound(betAmount: number) {
    this.potValue += betAmount;
  }

  startRound() {
    this.roundNumber++;
    this.state       = TapGameState.RUNNING;
    this.elapsedTime = 0;
    this.playerTapCount    = 0;
    this.playerLastTapTime = -1;
    this.tapCounts.clear();
    this.lastTapTimes.clear();
    this.lastTapper  = null;
    this.tapHistory  = [];

    this.hiddenDuration = this.generateDuration();
  }

  update(dt: number): boolean {
    if (this.state !== TapGameState.RUNNING) return false;

    this.elapsedTime += dt;

    if (this.elapsedTime >= this.hiddenDuration) {
      this.elapsedTime = this.hiddenDuration;
      this.state = TapGameState.ENDED;
      this.determineWinner();
      this.recentDurations.push(parseFloat(this.hiddenDuration.toFixed(1)));
      if (this.recentDurations.length > 10) this.recentDurations.shift();
      return true;
    }
    return false;
  }

  /**
   * Register a tap. First tap is free; subsequent taps cost tapCost. Enforces cooldown.
   * Returns true if the tap was accepted.
   */
  registerPlayerTap(): boolean {
    if (this.state !== TapGameState.RUNNING || !this.playerInRound) return false;

    if (this.playerLastTapTime >= 0 &&
        this.elapsedTime - this.playerLastTapTime < mathConfig.tap.tapCooldownSec) return false;

    if (this.playerTapCount > 0) {
      if (this.playerBalance < this.tapCost) return false;
      this.playerBalance -= this.tapCost;
      this.potValue      += this.tapCost;
    }

    this.playerTapCount++;
    this.playerLastTapTime = this.elapsedTime;
    this.tapCounts.set('YOU', this.playerTapCount);
    const entry: TapEntry = { name: 'YOU', isPlayer: true, tapTime: this.elapsedTime };
    this.lastTapper = entry;
    this.tapHistory.push(entry);
    return true;
  }

  /**
   * Register a bot tap. Returns the cost charged (0 for first tap, tapCost otherwise).
   * Returns -1 if the tap was rejected (cooldown active).
   */
  registerBotTap(name: string): number {
    if (this.state !== TapGameState.RUNNING) return -1;

    const lastTime = this.lastTapTimes.get(name) ?? -1;
    if (lastTime >= 0 && this.elapsedTime - lastTime < mathConfig.tap.tapCooldownSec) return -1;

    const count = this.tapCounts.get(name) ?? 0;
    const cost = count > 0 ? this.tapCost : 0;

    this.tapCounts.set(name, count + 1);
    this.lastTapTimes.set(name, this.elapsedTime);
    const entry: TapEntry = { name, isPlayer: false, tapTime: this.elapsedTime };
    this.lastTapper = entry;
    this.tapHistory.push(entry);
    if (cost > 0) this.potValue += cost;

    return cost;
  }

  /** Inverse-CDF distribution matching crash multiplier shape: P(t > x) = timerMin / x */
  private generateDuration(): number {
    const r = Math.random();
    const { timerMin, timerMax } = mathConfig.tap;
    const raw = timerMin / (1 - r);
    return Math.min(Math.max(raw, timerMin), timerMax);
  }

  private determineWinner() {
    if (this.lastTapper) {
      this.winnerPayout = this.potValue * (1 - mathConfig.tap.casinoCut);
    } else {
      this.winnerPayout = 0;
    }
  }

  showResult() {
    this.state = TapGameState.RESULT;
  }

  awardPot() {
    if (this.lastTapper) {
      if (this.lastTapper.isPlayer) {
        this.playerBalance += this.winnerPayout;
      }
      this.potValue = 0;
    }

    if (this.playerBalance < mathConfig.player.rebuyThreshold) {
      this.playerBalance = mathConfig.player.rebuyAmount;
    }
  }

  resetForLobby() {
    this.state           = TapGameState.BETTING;
    this.roundNumber     = 0;
    this.potValue        = 0;
    this.elapsedTime     = 0;
    this.playerBalance     = mathConfig.player.startingBalance;
    this.playerInRound     = false;
    this.playerTapCount    = 0;
    this.playerLastTapTime = -1;
    this.tapCounts.clear();
    this.lastTapTimes.clear();
    this.lastTapper      = null;
    this.tapHistory      = [];
    this.winnerPayout    = 0;
    this.recentDurations = [];
  }
}
