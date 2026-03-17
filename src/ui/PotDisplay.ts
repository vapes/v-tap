import { Container, Text, TextStyle } from 'pixi.js';

function lerpColor(c1: number, c2: number, t: number): number {
  const r = Math.round(((c1 >> 16) & 0xff) + (((c2 >> 16) & 0xff) - ((c1 >> 16) & 0xff)) * t);
  const g = Math.round(((c1 >> 8) & 0xff) + (((c2 >> 8) & 0xff) - ((c1 >> 8) & 0xff)) * t);
  const b = Math.round((c1 & 0xff) + ((c2 & 0xff) - (c1 & 0xff)) * t);
  return (r << 16) | (g << 8) | b;
}

export class PotDisplay extends Container {
  private potStyle: TextStyle;
  private potText: Text;

  private totalBetStyle: TextStyle;
  private totalBetText: Text;

  private flashTimer = 0;
  private static readonly FLASH_DUR = 0.45;
  private static readonly BASE_COLOR = 0xffdd00;
  private static readonly FLASH_COLOR = 0xffffff;

  constructor() {
    super();

    this.potStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffdd00,
      dropShadow: true,
      dropShadowColor: 0xffdd00,
      dropShadowBlur: 6,
      dropShadowDistance: 0,
    });
    this.potText = new Text('POT: $0', this.potStyle);
    this.potText.anchor.set(0.5, 0);
    this.addChild(this.potText);

    this.totalBetStyle = new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 11,
      fontWeight: 'bold',
      fill: 0xffffff,
    });
    this.totalBetText = new Text('', this.totalBetStyle);
    this.totalBetText.anchor.set(0.5, 0);
    this.totalBetText.visible = false;
    this.addChild(this.totalBetText);
  }

  setPot(value: number) {
    this.potText.text = `POT: $${value.toLocaleString('en-US')}`;
  }

  setTotalBet(value: number, isLastTapper: boolean) {
    this.totalBetText.text = `total bet: $${value.toLocaleString('en-US')}`;
    this.totalBetStyle.fill = isLastTapper ? 0x00ff88 : 0xffffff;
    this.totalBetText.visible = true;
  }

  hideTotalBet() {
    this.totalBetText.visible = false;
  }

  flash() {
    this.flashTimer = PotDisplay.FLASH_DUR;
  }

  animate(dt: number) {
    if (this.flashTimer <= 0) return;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const intensity = Math.sin((this.flashTimer / PotDisplay.FLASH_DUR) * Math.PI);
    const color = lerpColor(PotDisplay.BASE_COLOR, PotDisplay.FLASH_COLOR, intensity * 0.7);
    this.potStyle.fill = color;
    this.potStyle.dropShadowColor = color;
    this.potStyle.dropShadowBlur = 6 + intensity * 18;
  }

  layout(colWidth: number, topY = 8) {
    this.potText.x = colWidth / 2;
    this.potText.y = topY;
    this.totalBetText.x = colWidth / 2;
    this.totalBetText.y = topY + 22;
  }

  getPotCenter(): { x: number; y: number } {
    return {
      x: this.x + this.potText.x,
      y: this.y + this.potText.y + this.potText.height / 2,
    };
  }
}
