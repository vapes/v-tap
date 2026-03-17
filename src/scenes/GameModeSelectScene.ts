import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js';

export type GameMode = 'crash' | 'tap';

export class GameModeSelectScene {
  private app: Application;
  private container: Container;
  private tickerFn: (() => void) | null = null;
  private cards: Container[] = [];

  onModeSelected: ((mode: GameMode) => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
  }

  show() {
    this.container.removeChildren();
    this.cards = [];

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const bg = new Graphics();
    bg.beginFill(0x0a0a1a);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    const header = new Text('CHOOSE GAME', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   28,
      fontWeight: 'bold',
      fill:       0xffffff,
      dropShadow: true,
      dropShadowColor: 0x00ff88,
      dropShadowBlur:  15,
      dropShadowDistance: 0,
    }));
    header.anchor.set(0.5, 0);
    header.x = w / 2;
    header.y = h * 0.10;
    this.container.addChild(header);

    const cardW = Math.min(280, w - 40);
    const cardH = Math.min(160, (h * 0.55) / 2);
    const gap   = 20;
    const startX = (w - cardW) / 2;
    const startY = h * 0.24;

    const crashCard = this.createModeCard(
      startX, startY, cardW, cardH,
      'CRASH + POT', 0x00ff88,
      'Multiplier grows until crash',
      'Cash out before crash to win',
      'Last cashout wins the pot',
      'crash',
    );
    this.container.addChild(crashCard);
    this.cards.push(crashCard);

    const tapCard = this.createModeCard(
      startX, startY + cardH + gap, cardW, cardH,
      'LAST TAP', 0xff8800,
      'Hidden timer counts down',
      'Tap to claim the pot',
      'Last tap before time runs out wins!',
      'tap',
    );
    this.container.addChild(tapCard);
    this.cards.push(tapCard);

    const hint = new Text('Pick a game mode', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   12,
      fill:       0x666666,
    }));
    hint.anchor.set(0.5);
    hint.x = w / 2;
    hint.y = h - 40;
    this.container.addChild(hint);

    let phase = 0;
    this.tickerFn = () => {
      phase += 0.03;
      for (let i = 0; i < this.cards.length; i++) {
        const glow = this.cards[i].getChildByName('glow') as Graphics | null;
        if (glow) glow.alpha = 0.3 + Math.sin(phase + i * 1.2) * 0.15;
      }
    };
    this.app.ticker.add(this.tickerFn);
    this.app.stage.addChild(this.container);
  }

  private createModeCard(
    x: number, y: number, w: number, h: number,
    title: string, color: number,
    line1: string, line2: string, line3: string,
    mode: GameMode,
  ): Container {
    const card = new Container();
    card.x = x;
    card.y = y;

    const glow = new Graphics();
    glow.name = 'glow';
    glow.lineStyle(2, color, 0.4);
    glow.drawRoundedRect(0, 0, w, h, 14);
    card.addChild(glow);

    const bgRect = new Graphics();
    bgRect.beginFill(color, 0.08);
    bgRect.drawRoundedRect(0, 0, w, h, 14);
    bgRect.endFill();
    card.addChild(bgRect);

    this.drawModeIcon(card, mode, color, 30, h / 2);

    const titleText = new Text(title, new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   22,
      fontWeight: 'bold',
      fill:       color,
    }));
    titleText.x = 60;
    titleText.y = h * 0.15;
    card.addChild(titleText);

    const descStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   10,
      fill:       0x888888,
    });
    const lines = [line1, line2, line3];
    for (let i = 0; i < lines.length; i++) {
      const t = new Text(lines[i], descStyle);
      t.x = 60;
      t.y = h * 0.45 + i * 16;
      card.addChild(t);
    }

    bgRect.eventMode = 'static';
    bgRect.cursor    = 'pointer';
    bgRect.on('pointerdown', () => this.onModeSelected?.(mode));

    return card;
  }

  private drawModeIcon(parent: Container, mode: GameMode, color: number, cx: number, cy: number) {
    const g = new Graphics();
    if (mode === 'crash') {
      g.beginFill(color, 0.7);
      g.moveTo(cx, cy - 16);
      g.lineTo(cx + 10, cy + 4);
      g.lineTo(cx + 4, cy + 4);
      g.lineTo(cx + 8, cy + 16);
      g.lineTo(cx - 2, cy + 2);
      g.lineTo(cx + 4, cy + 2);
      g.lineTo(cx, cy - 16);
      g.endFill();
    } else {
      g.beginFill(color, 0.7);
      g.drawCircle(cx, cy - 8, 6);
      g.endFill();
      g.beginFill(color, 0.5);
      g.drawRoundedRect(cx - 4, cy - 2, 8, 14, 3);
      g.endFill();
      g.lineStyle(2, color, 0.6);
      g.moveTo(cx - 6, cy + 14);
      g.lineTo(cx - 6, cy + 18);
      g.moveTo(cx + 6, cy + 14);
      g.lineTo(cx + 6, cy + 18);
    }
    parent.addChild(g);
  }

  hide() {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
    this.app.stage.removeChild(this.container);
  }

  onResize(_width: number, _height: number) {}
}
