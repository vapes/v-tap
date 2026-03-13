import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js';

export class LobbyScene {
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

    // Dark background
    const bg = new Graphics();
    bg.beginFill(0x0a0a1a);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // Paw logo
    const pawLogo = new Graphics();
    const logoR = 64;
    // Circle background
    pawLogo.beginFill(0x00cc66, 0.85);
    pawLogo.drawCircle(0, 0, logoR);
    pawLogo.endFill();
    // Highlight
    pawLogo.beginFill(0xffffff, 0.1);
    pawLogo.drawEllipse(0, -logoR * 0.25, logoR * 0.6, logoR * 0.35);
    pawLogo.endFill();
    // Border
    pawLogo.lineStyle(2, 0x00cc66, 0.6);
    pawLogo.drawCircle(0, 0, logoR);
    // Glow ring
    pawLogo.lineStyle(2, 0x00ff88, 0.4);
    pawLogo.drawCircle(0, 0, logoR + 4);
    // Paw
    const s = logoR * 0.55;
    pawLogo.lineStyle(0);
    pawLogo.beginFill(0xffffff, 0.9);
    pawLogo.drawEllipse(0, s * 0.2, s * 0.45, s * 0.38);
    pawLogo.endFill();
    const toes = [
      { x: -s * 0.38, y: -s * 0.28 },
      { x: -s * 0.13, y: -s * 0.5 },
      { x: s * 0.13, y: -s * 0.5 },
      { x: s * 0.38, y: -s * 0.28 },
    ];
    for (const toe of toes) {
      pawLogo.beginFill(0xffffff, 0.9);
      pawLogo.drawEllipse(toe.x, toe.y, s * 0.14, s * 0.16);
      pawLogo.endFill();
    }
    pawLogo.x = w / 2;
    pawLogo.y = h / 2 - 100;
    this.container.addChild(pawLogo);

    // Title
    const titleStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 42,
      fontWeight: 'bold',
      fill: 0x00ff88,
      dropShadow: true,
      dropShadowColor: 0x00ff88,
      dropShadowBlur: 20,
      dropShadowDistance: 0,
    });
    const title = new Text('LAST TAP', titleStyle);
    title.anchor.set(0.5);
    title.x = w / 2;
    title.y = h / 2 + 10;
    this.container.addChild(title);

    // Subtitle
    const subStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 14,
      fill: 0x888888,
    });
    const sub = new Text('Cash out last. Win the pot.', subStyle);
    sub.anchor.set(0.5);
    sub.x = w / 2;
    sub.y = h / 2 + 50;
    this.container.addChild(sub);

    // Start prompt
    const startStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 18,
      fill: 0xffdd00,
    });
    const startText = new Text('[ Tap to start ]', startStyle);
    startText.anchor.set(0.5);
    startText.x = w / 2;
    startText.y = h / 2 + 110;
    this.container.addChild(startText);

    // Blink animation
    let phase = 0;
    const ticker = () => {
      phase += 0.05;
      startText.alpha = 0.4 + Math.sin(phase) * 0.6;
    };
    this.app.ticker.add(ticker);

    this.app.stage.addChild(this.container);

    // Click to start
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
    // Lobby is transient, skip complex relayout
  }
}
