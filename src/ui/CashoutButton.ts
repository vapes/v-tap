import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';

export class CashoutButton extends Container {
  private progressRing:  Graphics;
  private bg:            Graphics;
  private paw:           Graphics;
  private glowRing:      Graphics;
  private countdownText: Text;
  private isEnabled     = true;
  private pulsePhase    = 0;

  private readonly RADIUS = 52;
  private readonly PROGRESS_RADIUS = 64;
  private readonly PROGRESS_THICKNESS = 4;

  onTap: (() => void) | null = null;

  constructor() {
    super();

    this.progressRing = new Graphics();
    this.addChild(this.progressRing);

    this.glowRing = new Graphics();
    this.addChild(this.glowRing);

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.paw = new Graphics();
    this.addChild(this.paw);

    this.countdownText = new Text('', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   36,
      fontWeight: 'bold',
      fill:       0xffdd00,
      dropShadow: true,
      dropShadowColor: 0xffaa00,
      dropShadowBlur:  8,
      dropShadowDistance: 0,
      align:      'center',
    }));
    this.countdownText.anchor.set(0.5);
    this.countdownText.visible = false;
    this.addChild(this.countdownText);

    this.drawButton(0x00cc66);
    this.drawPaw(0xffffff);

    this.eventMode = 'static';
    this.cursor    = 'pointer';
    this.on('pointerdown', this.handleTap, this);
  }

  private drawButton(color: number) {
    const r = this.RADIUS;
    this.bg.clear();
    this.bg.beginFill(color, 0.85);
    this.bg.drawCircle(0, 0, r);
    this.bg.endFill();
    this.bg.beginFill(0xffffff, 0.1);
    this.bg.drawEllipse(0, -r * 0.25, r * 0.6, r * 0.35);
    this.bg.endFill();
    this.bg.lineStyle(2, color, 0.6);
    this.bg.drawCircle(0, 0, r);
  }

  private drawGlow(color: number, intensity: number) {
    this.glowRing.clear();
    if (intensity <= 0) return;
    const r = this.RADIUS;
    this.glowRing.beginFill(color, intensity * 0.1);
    this.glowRing.drawCircle(0, 0, r + 5);
    this.glowRing.endFill();
    this.glowRing.lineStyle(2, color, intensity * 0.5);
    this.glowRing.drawCircle(0, 0, r + 2);
  }

  private drawPaw(color: number) {
    this.paw.clear();
    const s = this.RADIUS * 0.55;
    this.paw.beginFill(color, 0.9);
    this.paw.drawEllipse(0, s * 0.2, s * 0.45, s * 0.38);
    this.paw.endFill();
    const toes = [
      { x: -s * 0.38, y: -s * 0.28 },
      { x: -s * 0.13, y: -s * 0.5  },
      { x:  s * 0.13, y: -s * 0.5  },
      { x:  s * 0.38, y: -s * 0.28 },
    ];
    for (const toe of toes) {
      this.paw.beginFill(color, 0.9);
      this.paw.drawEllipse(toe.x, toe.y, s * 0.14, s * 0.16);
      this.paw.endFill();
    }
  }

  private clearProgressRing() {
    this.progressRing.clear();
  }

  setCountdown(secs: number) {
    this.countdownText.text    = String(secs);
    this.countdownText.visible = true;
    this.paw.visible           = false;
  }

  hideCountdown() {
    this.countdownText.visible = false;
    this.paw.visible           = true;
  }

  private handleTap(_e: FederatedPointerEvent) {
    if (!this.isEnabled) return;
    this.onTap?.();
  }

  /** Betting phase — player hasn't bet yet. */
  showBetMode(betAmount: number) {
    this.isEnabled = true;
    this.cursor    = 'pointer';
    this.alpha     = 1;
    this.drawButton(0xaa8800);
    this.drawPaw(0xffee00);
    this.drawGlow(0xffcc00, 0.6);
    this.scale.set(1);
    // countdown will be shown each frame via setCountdown(); hide paw explicitly
    this.paw.visible           = false;
    this.countdownText.visible = false; // will be set by setCountdown next frame
  }

  /** Betting phase — bet has been placed, waiting for round. */
  showBetPlaced() {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.drawButton(0xffcc00);
    this.drawPaw(0xffffff);
    this.drawGlow(0xffee00, 0.9);
    this.alpha = 1;
    this.hideCountdown();
  }

  /** Player is not in this round. */
  showNotInRound() {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.alpha     = 0.15;
    this.clearProgressRing();
    this.hideCountdown();
  }

  /** Running phase — player can queue bet for next round. */
  showNextRoundMode(betAmount: number) {
    this.isEnabled = true;
    this.cursor    = 'pointer';
    this.alpha     = 0.75;
    this.clearProgressRing();
    this.drawButton(0x334466);
    this.drawPaw(0x88aadd);
    this.drawGlow(0x4488ff, 0.3);
    this.scale.set(1);
    this.hideCountdown();
  }

  /** Bet queued for next round — tap again to cancel. */
  showNextRoundQueued(betAmount: number) {
    this.isEnabled = true;
    this.cursor    = 'pointer';
    this.alpha     = 1;
    this.clearProgressRing();
    this.drawButton(0x223355);
    this.drawPaw(0x4499ff);
    this.drawGlow(0x4488ff, 0.7);
    this.scale.set(1);
    this.hideCountdown();
  }

  /** Running phase — player can cash out. */
  showCashoutMode() {
    this.isEnabled = true;
    this.cursor    = 'pointer';
    this.alpha     = 1;
    this.pulsePhase = 0;
    this.clearProgressRing();
    this.drawButton(0x00cc66);
    this.drawPaw(0xffffff);
    this.drawGlow(0x00cc66, 0);
    this.scale.set(1);
    this.hideCountdown();
  }

  showCashedOut(multiplier: number) {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.clearProgressRing();
    this.drawButton(0x226633);
    this.drawPaw(0x88ffaa);
    this.drawGlow(0x00ff88, 0.9);
    this.alpha = 0.9;
    this.hideCountdown();
  }

  showCrashed() {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.clearProgressRing();
    this.drawButton(0x661111);
    this.drawPaw(0xff4444);
    this.drawGlow(0xff0000, 0.4);
    this.alpha = 0.7;
    this.hideCountdown();
  }

  // kept for compatibility
  reset() {
    this.showCashoutMode();
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.cursor    = enabled ? 'pointer' : 'default';
    this.alpha     = enabled ? 1 : 0.4;
  }

  /** Called every frame during betting phase while player hasn't bet yet. */
  pulseBetting(dt: number) {
    this.pulsePhase += dt * 3;
    const t = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    this.scale.set(1 + t * 0.06);
    this.drawGlow(0xffcc00, 0.3 + t * 0.7);
  }

  /**
   * Called every frame during betting phase.
   * @param progress 1.0 = full (round just started), 0.0 = about to launch
   */
  animateBetting(progress: number) {
    const r = this.PROGRESS_RADIUS;
    const t = this.PROGRESS_THICKNESS;

    this.progressRing.clear();

    // Dim track — draw as arc so it doesn't auto-connect
    this.progressRing.lineStyle(t, 0xffcc00, 0.15);
    this.progressRing.moveTo(0, -r);
    this.progressRing.arc(0, 0, r, -Math.PI / 2, Math.PI * 3 / 2, false);

    if (progress > 0.005) {
      // Arc always ENDS at top (-π/2), start retreats clockwise as time runs out
      const endAngle   = Math.PI * 3 / 2; // same as -π/2, but avoids zero-span
      const startAngle = -Math.PI / 2 + Math.PI * 2 * (1 - progress);
      const sx = r * Math.cos(startAngle);
      const sy = r * Math.sin(startAngle);

      // Glow halo
      this.progressRing.lineStyle(t + 4, 0xffcc00, 0.15);
      this.progressRing.moveTo(sx, sy);
      this.progressRing.arc(0, 0, r, startAngle, endAngle, false);

      // Main arc
      this.progressRing.lineStyle(t, 0xffee00, 0.9);
      this.progressRing.moveTo(sx, sy);
      this.progressRing.arc(0, 0, r, startAngle, endAngle, false);
    }
  }

  animate(dt: number, multiplier: number) {
    if (!this.isEnabled) return;
    this.pulsePhase  += dt * 4;
    const intensity   = Math.min(multiplier * 0.1, 1) * (0.5 + 0.5 * Math.sin(this.pulsePhase));
    const color       = multiplier < 5 ? 0x00cc66 : multiplier < 10 ? 0xddaa00 : 0xff4400;
    this.drawButton(color);
    this.drawPaw(0xffffff);
    this.drawGlow(color, intensity);
    this.scale.set(1 + intensity * 0.04);
  }

  showTapMode() {
    this.isEnabled  = true;
    this.cursor     = 'pointer';
    this.alpha      = 1;
    this.pulsePhase = 0;
    this.clearProgressRing();
    this.drawButton(0xff8800);
    this.drawPaw(0xffffff);
    this.drawGlow(0xff8800, 0.4);
    this.scale.set(1);
    this.hideCountdown();
  }

  animateTap(dt: number, elapsed: number) {
    if (!this.isEnabled) return;
    this.pulsePhase += dt * 5;
    const intensity  = Math.min(elapsed * 0.05, 1) * (0.5 + 0.5 * Math.sin(this.pulsePhase));
    const color      = elapsed < 10 ? 0xff8800 : elapsed < 20 ? 0xff5500 : 0xff2200;
    this.drawButton(color);
    this.drawPaw(0xffffff);
    this.drawGlow(color, intensity);
    this.scale.set(1 + intensity * 0.04);
  }

  showTapDisabled() {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.clearProgressRing();
    this.drawButton(0x553300);
    this.drawPaw(0x886644);
    this.drawGlow(0xff8800, 0.2);
    this.alpha = 0.6;
    this.hideCountdown();
  }

  showTimeUp() {
    this.isEnabled = false;
    this.cursor    = 'default';
    this.clearProgressRing();
    this.drawButton(0x661111);
    this.drawPaw(0xff4444);
    this.drawGlow(0xff0000, 0.4);
    this.alpha = 0.7;
    this.hideCountdown();
  }
}
