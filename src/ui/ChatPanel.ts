import { Container, Graphics, Text, TextStyle } from 'pixi.js';

interface ChatMessage {
  text: string;
  color: number;
  age: number;
}

const WIN_PHRASES = [
  'ez money 💰',
  'gg',
  'lets goooo',
  'nice one',
  'im out ✌️',
  'cash secured',
  'too easy',
  'profit 📈',
  'clean exit',
  'ty ty',
  'yessss',
  'not greedy today',
  'safe play',
  'im rich',
  'smooth',
];

const LOSE_PHRASES = [
  'nooo 😭',
  'rip',
  'gg',
  'again...',
  'pain',
  'should have tapped',
  'wtf',
  'bruh',
  'i knew it',
  'why do i play this',
  'one more round',
  'unlucky',
  'rigged',
  '💀',
  'im done... jk',
  'that was close',
];

const RANDOM_PHRASES = [
  'gl everyone',
  'this one is mine',
  'feeling lucky',
  'hold hold hold',
  'moon or bust 🚀',
  'careful guys',
  'im shaking',
  'cmon cmon',
];

const MAX_MESSAGES = 5;
const MESSAGE_LIFETIME = 6; // seconds before fade starts
const FADE_DURATION = 2; // seconds to fully fade out
/** Chance a bot writes in chat on cashout or bust */
const CHAT_CHANCE_WIN = 0.45;
const CHAT_CHANCE_LOSE = 0.3;
/** Chance of a random message during a round */
const RANDOM_CHAT_CHANCE = 0.08;

export class ChatPanel extends Container {
  private messages: ChatMessage[] = [];
  private textObjects: Text[] = [];
  private bg: Graphics;
  private panelWidth = 0;
  private panelHeight = 0;

  constructor() {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);
  }

  layout(x: number, y: number, width: number, height: number) {
    this.panelWidth  = width - 8;
    this.panelHeight = height - 8;
    this.x = x + 4;
    this.y = y;
    this.drawBg();
    this.rebuildTexts();
  }

  private drawBg() {
    this.bg.clear();
    this.bg.beginFill(0x0a0a1a, 0.7);
    this.bg.drawRoundedRect(0, 0, this.panelWidth, this.panelHeight, 6);
    this.bg.endFill();
    this.bg.lineStyle(1, 0x333355, 0.3);
    this.bg.drawRoundedRect(0, 0, this.panelWidth, this.panelHeight, 6);
  }

  addMessage(name: string, text: string, color: number) {
    this.messages.push({ text: `${name}: ${text}`, color, age: 0 });
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.shift();
    }
    this.rebuildTexts();
  }

  /** Bot won — maybe write something */
  onBotWin(name: string, multiplier: number, color: number) {
    if (Math.random() > CHAT_CHANCE_WIN) return;
    const phrase = pick(WIN_PHRASES);
    const mult = `${multiplier.toFixed(2)}x`;
    // Sometimes include multiplier
    const text = Math.random() < 0.5 ? `${phrase} ${mult}` : phrase;
    this.addMessage(name, text, color);
  }

  /** Bot lost — maybe write something */
  onBotLose(name: string, color: number) {
    if (Math.random() > CHAT_CHANCE_LOSE) return;
    this.addMessage(name, pick(LOSE_PHRASES), color);
  }

  /** Player won */
  onPlayerWin(multiplier: number) {
    const mult = `${multiplier.toFixed(2)}x`;
    this.addMessage('YOU', `cashed out at ${mult}`, 0x00ff88);
  }

  /** Player lost */
  onPlayerLose() {
    this.addMessage('YOU', 'busted 💀', 0xff4444);
  }

  /** Random chatter during round */
  maybeRandomChat(name: string, color: number) {
    if (Math.random() > RANDOM_CHAT_CHANCE) return;
    this.addMessage(name, pick(RANDOM_PHRASES), color);
  }

  animate(dt: number) {
    let needsRebuild = false;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      this.messages[i].age += dt;
      if (this.messages[i].age > MESSAGE_LIFETIME + FADE_DURATION) {
        this.messages.splice(i, 1);
        needsRebuild = true;
      }
    }

    // Update alpha for fading
    for (let i = 0; i < this.textObjects.length; i++) {
      const msg = this.messages[i];
      if (!msg) continue;
      if (msg.age > MESSAGE_LIFETIME) {
        const fadeProgress = (msg.age - MESSAGE_LIFETIME) / FADE_DURATION;
        this.textObjects[i].alpha = 1 - fadeProgress;
      } else {
        this.textObjects[i].alpha = 1;
      }
    }

    if (needsRebuild) this.rebuildTexts();
  }

  clear() {
    this.messages = [];
    this.rebuildTexts();
  }

  private rebuildTexts() {
    // Remove old text objects
    for (const t of this.textObjects) {
      this.removeChild(t);
      t.destroy();
    }
    this.textObjects = [];

    const maxWidth = this.panelWidth - 12;
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      const style = new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: msg.color,
        wordWrap: true,
        wordWrapWidth: maxWidth > 0 ? maxWidth : 300,
      });
      const t = new Text(msg.text, style);
      t.x = 6;
      t.y = 4 + i * 18;
      this.addChild(t);
      this.textObjects.push(t);
    }
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
