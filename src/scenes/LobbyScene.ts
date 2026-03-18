import { Application, Container, Text, TextStyle, Graphics } from 'pixi.js';
import type { SocketClient } from '../network/SocketClient';

export class LobbyScene {
  private app: Application;
  private container: Container;
  private socket: SocketClient;
  private onReady: ((nickname: string) => void) | null = null;
  private inputEl: HTMLInputElement | null = null;
  private tickerFn: (() => void) | null = null;

  constructor(app: Application, socket: SocketClient) {
    this.app = app;
    this.socket = socket;
    this.container = new Container();
  }

  show(onReady: (nickname: string) => void) {
    this.onReady = onReady;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const bg = new Graphics();
    bg.beginFill(0x0a0a1a);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // Paw logo
    const pawLogo = new Graphics();
    const logoR = 64;
    pawLogo.beginFill(0x00cc66, 0.85);
    pawLogo.drawCircle(0, 0, logoR);
    pawLogo.endFill();
    pawLogo.beginFill(0xffffff, 0.1);
    pawLogo.drawEllipse(0, -logoR * 0.25, logoR * 0.6, logoR * 0.35);
    pawLogo.endFill();
    pawLogo.lineStyle(2, 0x00cc66, 0.6);
    pawLogo.drawCircle(0, 0, logoR);
    pawLogo.lineStyle(2, 0x00ff88, 0.4);
    pawLogo.drawCircle(0, 0, logoR + 4);
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
    pawLogo.y = h / 2 - 120;
    this.container.addChild(pawLogo);

    // Title
    const title = new Text('LAST TAP', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 42,
      fontWeight: 'bold',
      fill: 0x00ff88,
      dropShadow: true,
      dropShadowColor: 0x00ff88,
      dropShadowBlur: 20,
      dropShadowDistance: 0,
    }));
    title.anchor.set(0.5);
    title.x = w / 2;
    title.y = h / 2 - 20;
    this.container.addChild(title);

    // Subtitle
    const sub = new Text('Cash out last. Win the pot.', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 14,
      fill: 0x888888,
    }));
    sub.anchor.set(0.5);
    sub.x = w / 2;
    sub.y = h / 2 + 20;
    this.container.addChild(sub);

    // Nickname label
    const nickLabel = new Text('Enter your nickname:', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 13,
      fill: 0xaaaaaa,
    }));
    nickLabel.anchor.set(0.5);
    nickLabel.x = w / 2;
    nickLabel.y = h / 2 + 60;
    this.container.addChild(nickLabel);

    // HTML input overlay for nickname
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.maxLength = 16;
    this.inputEl.placeholder = 'YourNickname';
    this.inputEl.autocomplete = 'off';
    Object.assign(this.inputEl.style, {
      position: 'fixed',
      left: '50%',
      top: `${h / 2 + 80}px`,
      transform: 'translateX(-50%)',
      width: '200px',
      padding: '10px 14px',
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      background: '#111122',
      border: '2px solid #00ff88',
      borderRadius: '8px',
      color: '#00ff88',
      textAlign: 'center',
      outline: 'none',
      zIndex: '1000',
    });
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });
    document.body.appendChild(this.inputEl);
    this.inputEl.focus();

    // Start button
    const startText = new Text('[ Tap to play ]', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 18,
      fill: 0xffdd00,
    }));
    startText.anchor.set(0.5);
    startText.x = w / 2;
    startText.y = h / 2 + 140;
    this.container.addChild(startText);

    let phase = 0;
    this.tickerFn = () => {
      phase += 0.05;
      startText.alpha = 0.4 + Math.sin(phase) * 0.6;
    };
    this.app.ticker.add(this.tickerFn);
    this.app.stage.addChild(this.container);

    this.container.eventMode = 'static';
    this.container.on('pointerdown', () => this.submit());
  }

  private submit() {
    const nick = this.inputEl?.value.trim() || '';
    this.onReady?.(nick);
  }

  hide() {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }
    this.app.stage.removeChild(this.container);
  }

  onResize(_width: number, _height: number) {}
}
