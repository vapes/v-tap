import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export class HeaderBar extends Container {
  private bg:          Graphics;
  private btnBg:       Graphics;
  private historyBox:  Container;

  static readonly HEIGHT = 36;

  onBack: (() => void) | null = null;

  constructor() {
    super();

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.btnBg = new Graphics();
    this.btnBg.eventMode = 'static';
    this.btnBg.cursor    = 'pointer';
    this.btnBg.on('pointerdown', () => this.onBack?.());
    this.addChild(this.btnBg);

    const backLabel = new Text('← Back', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   11,
      fill:       0x888888,
    }));
    backLabel.anchor.set(0, 0.5);
    backLabel.x = 18;
    backLabel.y = HeaderBar.HEIGHT / 2;
    this.addChild(backLabel);

    this.historyBox = new Container();
    this.addChild(this.historyBox);
  }

  layout(w: number) {
    const h = HeaderBar.HEIGHT;

    this.bg.clear();
    this.bg.beginFill(0x07070f, 0.98);
    this.bg.drawRect(0, 0, w, h);
    this.bg.endFill();
    this.bg.lineStyle(1, 0x1a1a2e, 1);
    this.bg.moveTo(0, h);
    this.bg.lineTo(w, h);

    this.btnBg.clear();
    this.btnBg.beginFill(0xffffff, 0.05);
    this.btnBg.drawRoundedRect(6, 5, 72, 26, 5);
    this.btnBg.endFill();

    this.historyBox.x = w - 6;
    this.historyBox.y = h / 2;
  }

  updateHistory(crashes: number[]) {
    this.historyBox.removeChildren();
    const recent = crashes.slice(-8).reverse();
    let xOff = 0;
    for (const crash of recent) {
      const color = crash < 2 ? 0xff3333 : crash < 5 ? 0xffaa00 : 0x00ff88;
      const label = `${crash.toFixed(1)}x`;
      const pillW = label.length * 6 + 8;

      const pill = new Graphics();
      pill.beginFill(color, 0.18);
      pill.drawRoundedRect(-xOff - pillW, -7, pillW, 14, 3);
      pill.endFill();
      this.historyBox.addChild(pill);

      const t = new Text(label, { fontFamily: '"Courier New", monospace', fontSize: 9, fill: color } as TextStyle);
      t.anchor.set(1, 0.5);
      t.x = -xOff - 4;
      this.historyBox.addChild(t);

      xOff += pillW + 3;
    }
  }

  updateTapHistory(durations: number[]) {
    this.historyBox.removeChildren();
    const recent = durations.slice(-8).reverse();
    let xOff = 0;
    for (const dur of recent) {
      const color = dur < 8 ? 0xff3333 : dur < 15 ? 0xffaa00 : 0x00ff88;
      const label = `${dur.toFixed(1)}s`;
      const pillW = label.length * 6 + 8;

      const pill = new Graphics();
      pill.beginFill(color, 0.18);
      pill.drawRoundedRect(-xOff - pillW, -7, pillW, 14, 3);
      pill.endFill();
      this.historyBox.addChild(pill);

      const t = new Text(label, { fontFamily: '"Courier New", monospace', fontSize: 9, fill: color } as TextStyle);
      t.anchor.set(1, 0.5);
      t.x = -xOff - 4;
      this.historyBox.addChild(t);

      xOff += pillW + 3;
    }
  }
}
