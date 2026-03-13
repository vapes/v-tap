import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js';

export class RulesScene {
  private app: Application;
  private container: Container;
  private onReady: (() => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
  }

  show(onReady: () => void) {
    this.onReady = onReady;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Background
    const bg = new Graphics();
    bg.beginFill(0x0a0a1a);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // Subtle grid
    const grid = new Graphics();
    grid.lineStyle(0.5, 0x1a1a2e, 0.6);
    for (let x = 0; x < w; x += 40) { grid.moveTo(x, 0); grid.lineTo(x, h); }
    for (let y = 0; y < h; y += 40) { grid.moveTo(0, y); grid.lineTo(w, y); }
    this.container.addChild(grid);

    // Header
    const headerY = h * 0.05;

    const headerStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 26,
      fontWeight: 'bold',
      fill: 0x00ff88,
      dropShadow: true,
      dropShadowColor: 0x00ff88,
      dropShadowBlur: 15,
      dropShadowDistance: 0,
    });
    const header = new Text('HOW TO PLAY', headerStyle);
    header.anchor.set(0.5, 0);
    header.x = w / 2;
    header.y = headerY;
    this.container.addChild(header);

    const subStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 9,
      fill: 0x445566,
      letterSpacing: 3,
    });
    const sub = new Text('LAST TAP  ·  CRASH GAME', subStyle);
    sub.anchor.set(0.5, 0);
    sub.x = w / 2;
    sub.y = headerY + 33;
    this.container.addChild(sub);

    const divider = new Graphics();
    divider.lineStyle(1, 0x00ff88, 0.25);
    divider.moveTo(w * 0.1, headerY + 52);
    divider.lineTo(w * 0.9, headerY + 52);
    this.container.addChild(divider);

    // Rule cards
    const rules = [
      {
        num: '01',
        color: 0x00ff88,
        title: 'CHOOSE YOUR TABLE',
        text: 'Pick a bet: $5 · $10 · $20 · $50\nFixed stake for the entire round',
      },
      {
        num: '02',
        color: 0xffdd00,
        title: 'WAIT FOR THE LAUNCH',
        text: '10-second betting phase, then the\nmultiplier starts climbing from 1.00×',
      },
      {
        num: '03',
        color: 0xff8800,
        title: 'CASH OUT IN TIME',
        text: 'Tap the paw to lock your multiplier\nPayout = (bet - $1) × your cashout value',
      },
      {
        num: '04',
        color: 0xff4466,
        title: 'POT WINNER RULE',
        text: 'Every bet adds $1 to POT\nLast cashout before crash wins the whole POT',
      },
    ];

    const cardsStartY = headerY + 64;
    const bottomReserve = 100;
    const cardH = Math.floor((h - cardsStartY - bottomReserve) / rules.length);
    const pad = 12;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const y = cardsStartY + i * cardH;

      // Card background
      const card = new Graphics();
      card.beginFill(rule.color, 0.04);
      card.drawRoundedRect(pad, y + 3, w - pad * 2, cardH - 8, 6);
      card.endFill();
      card.lineStyle(1, rule.color, 0.2);
      card.drawRoundedRect(pad, y + 3, w - pad * 2, cardH - 8, 6);
      this.container.addChild(card);

      // Left accent bar
      const bar = new Graphics();
      bar.beginFill(rule.color, 0.9);
      bar.drawRoundedRect(pad, y + 11, 3, cardH - 22, 2);
      bar.endFill();
      this.container.addChild(bar);

      // Step number
      const numStyle = new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: rule.color,
      });
      const num = new Text(rule.num, numStyle);
      num.alpha = 0.5;
      num.x = pad + 14;
      num.y = y + 10;
      this.container.addChild(num);

      // Title
      const titleStyle = new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 13,
        fontWeight: 'bold',
        fill: rule.color,
      });
      const title = new Text(rule.title, titleStyle);
      title.x = pad + 14;
      title.y = y + 24;
      this.container.addChild(title);

      // Description
      const textStyle = new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: 0x8899aa,
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: w - pad * 2 - 28,
      });
      const text = new Text(rule.text, textStyle);
      text.x = pad + 14;
      text.y = y + 42;
      this.container.addChild(text);
    }

    // Example tip
    const tipY = h - 90;
    const tipBg = new Graphics();
    tipBg.beginFill(0xffdd00, 0.06);
    tipBg.drawRoundedRect(pad, tipY, w - pad * 2, 38, 6);
    tipBg.endFill();
    tipBg.lineStyle(1, 0xffdd00, 0.22);
    tipBg.drawRoundedRect(pad, tipY, w - pad * 2, 38, 6);
    this.container.addChild(tipBg);

    const tipStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 11,
      fill: 0xffdd00,
      align: 'center',
    });
    const tip = new Text('Example: $10 table → 3.00× = +$27 payout\n+ whole POT if you are the last cashout', tipStyle);
    tip.anchor.set(0.5, 0.5);
    tip.x = w / 2;
    tip.y = tipY + 19;
    this.container.addChild(tip);

    // Tap to continue
    const startStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 15,
      fill: 0x00ff88,
    });
    const startText = new Text('[ TAP TO CONTINUE ]', startStyle);
    startText.anchor.set(0.5);
    startText.x = w / 2;
    startText.y = h - 26;
    this.container.addChild(startText);

    let phase = 0;
    const ticker = () => {
      phase += 0.05;
      startText.alpha = 0.4 + Math.sin(phase) * 0.6;
    };
    this.app.ticker.add(ticker);

    this.app.stage.addChild(this.container);

    this.container.eventMode = 'static';
    this.container.on('pointerdown', () => {
      this.app.ticker.remove(ticker);
      this.onReady?.();
    });
  }

  hide() {
    this.app.stage.removeChild(this.container);
  }

  onResize(_width: number, _height: number) {
  }
}
