import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js';
import mathConfig from '../math-config.json';

const TABLE_COLORS: number[] = [0x00ff88, 0x00ffff, 0xffdd00, 0xff8800];

export class TableSelectScene {
  private app: Application;
  private container: Container;
  private balanceText!: Text;
  private buttons: Container[] = [];
  private tickerFn: (() => void) | null = null;

  onTableSelected: ((bet: number) => void) | null = null;

  private getBalance: () => number;

  constructor(app: Application, getBalance: () => number) {
    this.app = app;
    this.container = new Container();
    this.getBalance = getBalance;
  }

  show() {
    this.container.removeChildren();
    this.buttons = [];

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const bg = new Graphics();
    bg.beginFill(0x0a0a1a);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // Balance
    this.balanceText = new Text(`Balance: $${this.getBalance().toLocaleString()}`, new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 14,
      fill: 0x00ff88,
    }));
    this.balanceText.anchor.set(0.5, 0);
    this.balanceText.x = w / 2;
    this.balanceText.y = h * 0.06;
    this.container.addChild(this.balanceText);

    // Header
    const header = new Text('CHOOSE TABLE', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 28,
      fontWeight: 'bold',
      fill: 0xffffff,
      dropShadow: true,
      dropShadowColor: 0x00ff88,
      dropShadowBlur: 15,
      dropShadowDistance: 0,
    }));
    header.anchor.set(0.5, 0);
    header.x = w / 2;
    header.y = h * 0.13;
    this.container.addChild(header);

    // Table buttons — 2x2 grid
    const tables = mathConfig.player.tables;
    const balance = this.getBalance();

    const cardW = Math.min(140, (w - 60) / 2);
    const cardH = Math.min(120, (h * 0.5) / 2);
    const gapX = 16;
    const gapY = 16;
    const gridW = cardW * 2 + gapX;
    const startX = (w - gridW) / 2;
    const startY = h * 0.26;

    for (let i = 0; i < tables.length; i++) {
      const bet = tables[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const color = TABLE_COLORS[i];
      const enabled = balance >= bet;

      const btn = this.createTableButton(x, y, cardW, cardH, bet, color, enabled);
      this.container.addChild(btn);
      this.buttons.push(btn);
    }

    // Hint at bottom
    const hint = new Text('Pick a table to join the round', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 12,
      fill: 0x666666,
    }));
    hint.anchor.set(0.5);
    hint.x = w / 2;
    hint.y = h - 40;
    this.container.addChild(hint);

    // Subtle pulse animation on enabled buttons
    let phase = 0;
    this.tickerFn = () => {
      phase += 0.03;
      for (let i = 0; i < this.buttons.length; i++) {
        const btn = this.buttons[i];
        const enabled = this.getBalance() >= tables[i];
        if (enabled) {
          const glow = btn.getChildByName('glow') as Graphics | null;
          if (glow) glow.alpha = 0.3 + Math.sin(phase + i * 0.8) * 0.15;
        }
      }
    };
    this.app.ticker.add(this.tickerFn);

    this.app.stage.addChild(this.container);
  }

  private createTableButton(
    x: number, y: number, w: number, h: number,
    bet: number, color: number, enabled: boolean,
  ): Container {
    const btn = new Container();
    btn.x = x;
    btn.y = y;

    // Glow border
    const glow = new Graphics();
    glow.name = 'glow';
    glow.lineStyle(2, enabled ? color : 0x333333, enabled ? 0.4 : 0.2);
    glow.drawRoundedRect(0, 0, w, h, 12);
    btn.addChild(glow);

    // Background
    const bg = new Graphics();
    bg.beginFill(enabled ? color : 0x333333, enabled ? 0.08 : 0.04);
    bg.drawRoundedRect(0, 0, w, h, 12);
    bg.endFill();
    btn.addChild(bg);

    // Bet amount
    const betStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 32,
      fontWeight: 'bold',
      fill: enabled ? color : 0x444444,
    });
    const betLabel = new Text(`$${bet}`, betStyle);
    betLabel.anchor.set(0.5);
    betLabel.x = w / 2;
    betLabel.y = h * 0.4;
    btn.addChild(betLabel);

    // "per round" label
    const subStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 10,
      fill: enabled ? 0x888888 : 0x333333,
    });
    const sub = new Text('per round', subStyle);
    sub.anchor.set(0.5);
    sub.x = w / 2;
    sub.y = h * 0.68;
    btn.addChild(sub);

    if (enabled) {
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bg.on('pointerdown', () => {
        this.onTableSelected?.(bet);
      });
    }

    return btn;
  }

  hide() {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
    this.app.stage.removeChild(this.container);
  }

  onResize(_width: number, _height: number) {
  }
}
