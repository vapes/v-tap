import { RoundManager } from './RoundManager';
import { PlayerRowData } from '../ui/PlayersPanel';
import mathConfig from '../math-config.json';

export type BotPersonality = 'conservative' | 'moderate' | 'aggressive' | 'degen';
export type AnimalType     = 'cat' | 'dog' | 'bear' | 'fox' | 'rabbit' | 'owl' | 'wolf' | 'panda';

export interface Bot {
  name:            string;
  personality:     BotPersonality;
  animalType:      AnimalType;
  neonColor:       number;
  balance:         number;
  currentBet:      number;
  targetMultiplier: number;
  hasCashedOut:    boolean;
  /** Decided at start of betting phase: will this bot bet this round? */
  willBet:         boolean;
  /** Seconds into the betting window when this bot "presses bet" */
  betDecisionTime: number;
  /** Has the bet actually been committed (pot contribution made)? */
  betCommitted:    boolean;
  totalWins:       number;
  totalLosses:     number;
}

type PersonalityConfig = { cashoutMin: number; cashoutMax: number };

const PERSONALITY_CONFIG = mathConfig.bots.personalities as Record<BotPersonality, PersonalityConfig>;

const PERSONALITIES: BotPersonality[] = ['conservative', 'moderate', 'aggressive', 'degen'];
const ANIMALS:       AnimalType[]     = ['cat', 'dog', 'bear', 'fox', 'rabbit', 'owl', 'wolf', 'panda'];
const NEON_COLORS = [
  0xff00ff, 0x00ffff, 0xff8800, 0x00ff88, 0x4488ff,
  0xffff00, 0xff4466, 0xbb88ff, 0xff6644, 0x44ffbb,
  0xffaa00, 0x00aaff, 0xaa00ff, 0x00ffaa, 0xff0088,
];
const NAME_A = ['Crypto','Moon','Diamond','Lucky','Risk','Safe','Night','Fast','Cool','Steady',
                'Wild','Dark','Neon','Ghost','Silver','Golden','Iron','Shadow','Turbo','Hyper'];
const NAME_B = ['King','Ace','Hands','Play','Shot','Eddie','Taker','Hand','Owl','Fox',
                'Wolf','Bear','Hawk','Eagle','Tiger','Lion','Shark','Viper','Ninja','Pro'];

function buildNamePool(): string[] {
  const pool: string[] = [];
  for (const a of NAME_A) for (const b of NAME_B) pool.push(`${a}${b}`);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export class BotPlayers {
  private bots: Bot[] = [];
  private roundManager: RoundManager;

  /** Fires when a bot commits their bet during the betting window. */
  onBotBetPlaced: ((botIndex: number) => void) | null = null;
  /** Fires when a bot cashes out during a round. */
  onBotCashout:   ((botIndex: number, name: string, multiplier: number) => void) | null = null;

  constructor(roundManager: RoundManager) {
    this.roundManager = roundManager;
    this.initBots();
  }

  private initBots() {
    const names = buildNamePool();
    const count  = 20 + Math.floor(Math.random() * 31); // 20–50 inclusive
    for (let i = 0; i < count; i++) {
      this.bots.push({
        name:             names[i],
        personality:      PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
        animalType:       ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
        neonColor:        NEON_COLORS[i % NEON_COLORS.length],
        balance:          mathConfig.bots.startingBalanceMin +
                            Math.floor(Math.random() * (mathConfig.bots.startingBalanceMax - mathConfig.bots.startingBalanceMin)),
        currentBet:       0,
        targetMultiplier: 0,
        hasCashedOut:     false,
        willBet:          false,
        betDecisionTime:  0,
        betCommitted:     false,
        totalWins:        0,
        totalLosses:      0,
      });
    }
  }

  /**
   * Call at the start of each betting phase.
   * Each bot randomly decides whether to bet and picks a time within the window.
   */
  prepareBettingPhase(bettingDuration: number) {
    const roundBetChance = 0.20 + Math.random() * 0.50; // 20–70% participation
    for (const bot of this.bots) {
      bot.willBet        = bot.balance >= this.roundManager.tableBet &&
                           Math.random() < roundBetChance;
      bot.betDecisionTime = 0.3 + Math.random() * (bettingDuration - 0.6);
      bot.betCommitted    = false;
      bot.currentBet      = 0;
    }
  }

  /**
   * Call every frame during the betting phase.
   * Returns indices of bots that just committed their bet this frame.
   */
  tickBetting(elapsed: number, tableBet: number): number[] {
    const joined: number[] = [];
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (!bot.willBet || bot.betCommitted) continue;
      if (elapsed < bot.betDecisionTime) continue;

      bot.betCommitted = true;
      bot.currentBet   = tableBet;
      bot.balance     -= tableBet;
      this.roundManager.botJoinRound(tableBet);
      joined.push(i);
      this.onBotBetPlaced?.(i);
    }
    return joined;
  }

  /** Set up cashout targets just before the round starts. */
  initRound() {
    for (const bot of this.bots) {
      if (!bot.betCommitted) {
        bot.hasCashedOut = true; // treat non-bettors as already out
        continue;
      }
      const cfg = PERSONALITY_CONFIG[bot.personality];
      bot.targetMultiplier = cfg.cashoutMin + Math.random() * (cfg.cashoutMax - cfg.cashoutMin);
      if (Math.random() < mathConfig.bots.greedyChance) {
        bot.targetMultiplier *= mathConfig.bots.greedyMultiplier;
      }
      bot.hasCashedOut = false;
    }
  }

  /** Call every frame during RUNNING. */
  update() {
    const m = this.roundManager.multiplier;
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (bot.hasCashedOut) continue;
      if (m >= bot.targetMultiplier) {
        bot.hasCashedOut = true;
        bot.totalWins++;
        const wager = bot.currentBet - mathConfig.player.potContribution;
        const cashoutAmount = wager * m;
        bot.balance += cashoutAmount;
        this.roundManager.addCashout({ name: bot.name, multiplier: m, isPlayer: false, cashoutAmount });
        this.onBotCashout?.(i, bot.name, m);
      }
    }
  }

  onCrash() {
    for (const bot of this.bots) {
      if (bot.betCommitted && !bot.hasCashedOut) {
        bot.totalLosses++;
      }
    }
  }

  awardPotToBot(name: string, amount: number) {
    const bot = this.bots.find(b => b.name === name);
    if (bot) bot.balance += amount;
  }

  checkRebuy() {
    for (const bot of this.bots) {
      if (bot.balance < mathConfig.bots.rebuyThreshold) {
        bot.balance = mathConfig.bots.rebuyBalanceMin +
          Math.floor(Math.random() * (mathConfig.bots.rebuyBalanceMax - mathConfig.bots.rebuyBalanceMin));
      }
    }
  }

  getBots(): Bot[] {
    return this.bots;
  }

  getBotRows(): PlayerRowData[] {
    return this.bots.map(bot => ({
      name:      bot.name,
      animalType: bot.animalType,
      neonColor: bot.neonColor,
      bet:       bot.currentBet,
      balance:   bot.balance,
      isPlayer:  false,
      status:    null,
      inRound:   bot.betCommitted,
    }));
  }
}
