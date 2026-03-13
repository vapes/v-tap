import { Container, Text, TextStyle } from 'pixi.js';

export class MultiplierText extends Container {
  private text: Text;
  private style: TextStyle;
  private baseScale  = 1;
  private pulsePhase = 0;

  constructor() {
    super();

    this.style = new TextStyle({
      fontFamily:        '"Courier New", monospace',
      fontSize:          56,
      fontWeight:        'bold',
      fill:              0x00ff88,
      dropShadow:        true,
      dropShadowColor:   0x00ff88,
      dropShadowBlur:    12,
      dropShadowDistance: 0,
      align:             'center',
    });

    this.text = new Text('1.00x', this.style);
    this.text.anchor.set(0.5);
    this.addChild(this.text);
  }

  private setColor(color: number) {
    this.style.fill            = color;
    this.style.dropShadowColor = color;
  }

  setValue(multiplier: number) {
    this.text.text = `${multiplier.toFixed(2)}x`;
    this.baseScale = 1 + Math.min(multiplier * 0.01, 0.2);

    if (multiplier < 2)       this.setColor(0x00ff88);
    else if (multiplier < 5)  this.setColor(0xffdd00);
    else if (multiplier < 10) this.setColor(0xff8800);
    else                      this.setColor(0xff2200);
  }

  animate(dt: number) {
    this.pulsePhase += dt * 3;
    this.scale.set(this.baseScale + Math.sin(this.pulsePhase) * 0.02);
  }

  showCrash(crashValue: number) {
    this.text.text   = `CRASHED\n${crashValue.toFixed(2)}x`;
    this.style.fontSize = 40;
    this.setColor(0xff0000);
    this.scale.set(1.1);
  }

  showBetting(_countdown: number) {
    this.text.text      = 'PLACE YOUR BETS';
    this.style.fontSize = 28;
    this.setColor(0xffdd00);
    this.scale.set(1);
  }

  showWaiting(countdown: number) {
    this.text.text      = `Next round\n${countdown.toFixed(0)}s`;
    this.style.fontSize = 26;
    this.setColor(0x888888);
    this.scale.set(1);
  }

  reset() {
    this.style.fontSize = 56;
    this.setColor(0x00ff88);
    this.baseScale  = 1;
    this.pulsePhase = 0;
    this.scale.set(1);
  }
}
