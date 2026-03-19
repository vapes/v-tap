import { randomUUID } from 'crypto';
import { BotPlayer } from './BotPlayer';
import { CrashRoom } from './CrashRoom';
import { TapRoom } from './TapRoom';
import { config } from './config';

const CRASH_BOT_NAMES = [
  'xXSlayerXx', 'LuckyAce', 'NightOwl', 'CoolCat', 'Wizard42',
  'ProGamer', 'StarDust', 'IronFist', 'SilentWolf', 'DragonFly',
];

const TAP_BOT_NAMES = [
  'CryptoKing', 'PixelNinja', 'RocketMan', 'GhostRider', 'TurboFox',
  'BlazeMaster', 'NeonViper', 'ThunderBolt', 'ShadowHawk', 'CosmicRay',
];

const BET_PROBABILITY = 0.85;
const POLL_MS = 100;

export class BotManager {
  private crashBots: BotPlayer[] = [];
  private tapBots: BotPlayer[] = [];

  private lastCrashPhase = '';
  private lastTapPhase = '';

  private crashTimeouts: ReturnType<typeof setTimeout>[] = [];
  private tapTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private crashRoom: CrashRoom,
    private tapRoom: TapRoom,
    botsPerRoom = 10,
  ) {
    for (let i = 0; i < botsPerRoom; i++) {
      const bot = new BotPlayer(
        `bot-crash-${randomUUID().slice(0, 8)}`,
        CRASH_BOT_NAMES[i % CRASH_BOT_NAMES.length],
        config.player.startingBalance,
      );
      this.crashBots.push(bot);
      crashRoom.addPlayer(bot);
    }

    for (let i = 0; i < botsPerRoom; i++) {
      const bot = new BotPlayer(
        `bot-tap-${randomUUID().slice(0, 8)}`,
        TAP_BOT_NAMES[i % TAP_BOT_NAMES.length],
        config.player.startingBalance,
      );
      this.tapBots.push(bot);
      tapRoom.addPlayer(bot);
    }

    setInterval(() => this.pollCrash(), POLL_MS);
    setInterval(() => this.pollTap(), POLL_MS);

    console.log(`[bots] ${botsPerRoom} bots spawned in each room`);
  }

  // ── Phase polling ──

  private pollCrash() {
    const phase = this.crashRoom.phase;
    if (phase !== this.lastCrashPhase) {
      this.lastCrashPhase = phase;
      this.onCrashPhaseChange(phase);
    }
  }

  private pollTap() {
    const phase = this.tapRoom.phase;
    if (phase !== this.lastTapPhase) {
      this.lastTapPhase = phase;
      this.onTapPhaseChange(phase);
    }
  }

  // ── Crash bot behaviour ──

  private onCrashPhaseChange(phase: string) {
    this.clearTimeouts(this.crashTimeouts);
    if (phase === 'BETTING') this.scheduleCrashBets();
    else if (phase === 'RUNNING') this.scheduleCrashCashouts();
  }

  private scheduleCrashBets() {
    const windowMs = config.timing.bettingDelaySec * 1000 - 500;
    for (const bot of this.crashBots) {
      if (Math.random() > BET_PROBABILITY) continue;
      const delay = 300 + Math.random() * windowMs;
      this.crashTimeouts.push(
        setTimeout(() => this.crashRoom.placeBet(bot.id), delay),
      );
    }
  }

  private scheduleCrashCashouts() {
    for (const bot of this.crashBots) {
      const delay = 800 + Math.random() * 12000;
      this.crashTimeouts.push(
        setTimeout(() => this.crashRoom.cashout(bot.id), delay),
      );
    }
  }

  // ── Tap bot behaviour ──

  private onTapPhaseChange(phase: string) {
    this.clearTimeouts(this.tapTimeouts);
    if (phase === 'BETTING') this.scheduleTapBets();
    else if (phase === 'RUNNING') this.scheduleTapActions();
  }

  private scheduleTapBets() {
    const windowMs = config.tap.bettingDelaySec * 1000 - 500;
    for (const bot of this.tapBots) {
      if (Math.random() > BET_PROBABILITY) continue;
      const delay = 300 + Math.random() * windowMs;
      this.tapTimeouts.push(
        setTimeout(() => this.tapRoom.placeBet(bot.id), delay),
      );
    }
  }

  private scheduleTapActions() {
    const cooldownMs = config.tap.tapCooldownSec * 1000;
    for (const bot of this.tapBots) {
      const numTaps = 1 + Math.floor(Math.random() * 5);
      for (let i = 0; i < numTaps; i++) {
        const delay = 500 + Math.random() * 12000 + i * (cooldownMs + 200 + Math.random() * 2000);
        this.tapTimeouts.push(
          setTimeout(() => this.tapRoom.tap(bot.id), delay),
        );
      }
    }
  }

  // ── Helpers ──

  private clearTimeouts(list: ReturnType<typeof setTimeout>[]) {
    for (const t of list) clearTimeout(t);
    list.length = 0;
  }
}
