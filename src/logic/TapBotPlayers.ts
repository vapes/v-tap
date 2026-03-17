import { TapRoundManager } from './TapRoundManager';
import { PlayerRowData } from '../ui/PlayersPanel';
import mathConfig from '../math-config.json';

export type BotPersonality = 'conservative' | 'moderate' | 'aggressive' | 'degen';
export type AnimalType     = 'cat' | 'dog' | 'bear' | 'fox' | 'rabbit' | 'owl' | 'wolf' | 'panda';

export interface TapBot {
  name:          string;
  personality:   BotPersonality;
  animalType:    AnimalType;
  neonColor:     number;
  balance:       number;
  willBet:       boolean;
  betDecisionTime: number;
  betCommitted:  boolean;
  tapCount:      number;
  nextTapTime:   number;
  lastTapTime:   number;
  isLastTapper:  boolean;
}

type TapPersonalityConfig = { intervalMin: number; intervalMax: number };
const TAP_PERSONALITY_CONFIG = mathConfig.tap.botTapPersonalities as Record<BotPersonality, TapPersonalityConfig>;

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

export class TapBotPlayers {
  private bots: TapBot[] = [];
  private roundManager: TapRoundManager;

  onBotBetPlaced: ((botIndex: number) => void) | null = null;
  onBotTap:       ((botIndex: number, name: string) => void) | null = null;

  constructor(roundManager: TapRoundManager) {
    this.roundManager = roundManager;
    this.initBots();
  }

  private initBots() {
    const names = buildNamePool();
    const count = 20 + Math.floor(Math.random() * 31);
    for (let i = 0; i < count; i++) {
      this.bots.push({
        name:          names[i],
        personality:   PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
        animalType:    ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
        neonColor:     NEON_COLORS[i % NEON_COLORS.length],
        balance:       mathConfig.bots.startingBalanceMin +
                         Math.floor(Math.random() * (mathConfig.bots.startingBalanceMax - mathConfig.bots.startingBalanceMin)),
        willBet:       false,
        betDecisionTime: 0,
        betCommitted:  false,
        tapCount:      0,
        nextTapTime:   0,
        lastTapTime:   -1,
        isLastTapper:  false,
      });
    }
  }

  prepareBettingPhase(bettingDuration: number) {
    const roundBetChance = 0.20 + Math.random() * 0.50;
    for (const bot of this.bots) {
      bot.willBet         = bot.balance >= this.roundManager.tableBet && Math.random() < roundBetChance;
      bot.betDecisionTime = 0.3 + Math.random() * (bettingDuration - 0.6);
      bot.betCommitted    = false;
      bot.tapCount        = 0;
      bot.lastTapTime     = -1;
      bot.isLastTapper    = false;
    }
  }

  tickBetting(elapsed: number): number[] {
    const joined: number[] = [];
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (!bot.willBet || bot.betCommitted) continue;
      if (elapsed < bot.betDecisionTime) continue;

      bot.betCommitted = true;
      bot.balance     -= this.roundManager.tableBet;
      this.roundManager.botJoinRound(this.roundManager.tableBet);
      joined.push(i);
      this.onBotBetPlaced?.(i);
    }
    return joined;
  }

  initRound() {
    for (const bot of this.bots) {
      if (!bot.betCommitted) continue;
      bot.tapCount     = 0;
      bot.isLastTapper = false;
      bot.nextTapTime  = this.getNextTapDelay(bot, 0);
    }
  }

  /**
   * Calculate when the bot will next tap.
   * Personality determines base interval; elapsed time adds hesitation.
   */
  private getNextTapDelay(bot: TapBot, elapsed: number): number {
    const cfg = TAP_PERSONALITY_CONFIG[bot.personality];
    const base = cfg.intervalMin + Math.random() * (cfg.intervalMax - cfg.intervalMin);
    const hesitation = elapsed * 0.05;
    return elapsed + base + hesitation;
  }

  update() {
    const elapsed = this.roundManager.elapsedTime;

    for (const bot of this.bots) {
      bot.isLastTapper = false;
    }

    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      if (!bot.betCommitted) continue;
      if (elapsed < bot.nextTapTime) continue;

      const tapCost = bot.tapCount > 0 ? this.roundManager.tableBet : 0;
      if (tapCost > 0 && bot.balance < this.roundManager.tableBet) continue;

      const cost = this.roundManager.registerBotTap(bot.name);
      if (cost < 0) continue;

      if (tapCost > 0) bot.balance -= tapCost;
      bot.tapCount++;
      bot.lastTapTime  = elapsed;
      bot.isLastTapper = true;
      bot.nextTapTime  = this.getNextTapDelay(bot, elapsed);
      this.onBotTap?.(i, bot.name);
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

  getBots(): TapBot[] {
    return this.bots;
  }

  getBotRows(): PlayerRowData[] {
    return this.bots.map(bot => ({
      name:       bot.name,
      animalType: bot.animalType,
      neonColor:  bot.neonColor,
      bet:        0,
      balance:    bot.balance,
      isPlayer:   false,
      status:     null,
      inRound:    bot.betCommitted,
      tapCount:   bot.tapCount,
    }));
  }
}
