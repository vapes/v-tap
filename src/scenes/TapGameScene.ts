import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SocketClient } from '../network/SocketClient';
import type {
  ServerMessage, RoomStateMsg, PhaseChangeMsg, BetPlacedMsg,
  PlayerTappedMsg, TickMsg, RoundResultMsg, BalanceUpdateMsg,
  PlayerJoinedMsg, PlayerLeftMsg, PlayerInfo,
} from '../../shared/protocol';
import { MultiplierText } from '../ui/MultiplierText';
import { CashoutButton } from '../ui/CashoutButton';
import { PotDisplay } from '../ui/PotDisplay';
import { PlayersPanel, PlayerRowData } from '../ui/PlayersPanel';
import { HeaderBar } from '../ui/HeaderBar';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

const NEON_COLORS = [
  0xff00ff, 0x00ffff, 0xff8800, 0x00ff88, 0x4488ff,
  0xffff00, 0xff4466, 0xbb88ff, 0xff6644, 0x44ffbb,
];
function nickColor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return NEON_COLORS[Math.abs(h) % NEON_COLORS.length];
}

const MAX_TAPS = 5;
const FIXED_BET = 10;

type Phase = 'BETTING' | 'RUNNING' | 'ENDED' | 'RESULT' | 'IDLE';

export class TapGameScene {
  private app: Application;
  private container: Container;
  private socket: SocketClient;

  private headerBar: HeaderBar;
  private multiplierText: MultiplierText;
  private cashoutButton: CashoutButton;
  private potDisplay: PotDisplay;
  private playersPanel: PlayersPanel;
  private endFlash: Graphics;
  private balanceText: Text;
  private buttonLabel: Text;

  private winAnnouncement: Text | null = null;
  private winFlyLabel: Text | null = null;
  private winFlyFrom = { x: 0, y: 0 };
  private winFlyTo = { x: 0, y: 0 };
  private winFlyT = 0;
  private winFlash: Graphics;
  private winFlashAlpha = 0;
  private winFlashPos = { x: 0, y: 0 };

  // Game state (driven by server)
  private phase: Phase = 'IDLE';
  private elapsed = 0;
  private pot = 0;
  private balance = 0;
  private myBet = false;
  private myTapCount = 0;
  private bettingTimeLeft = 0;
  private history: number[] = [];
  private lastTapperId: string | null = null;

  private players = new Map<string, PlayerInfo>();
  private playerOrder: string[] = [];
  private playerPendingNextRound = false;
  private resultTimer = 0;
  private labelBlinkPhase = 0;

  onLeaveTable: (() => void) | null = null;
  private handlers: Array<[string, (msg: ServerMessage) => void]> = [];

  constructor(app: Application, socket: SocketClient) {
    this.app = app;
    this.socket = socket;
    this.container = new Container();

    this.headerBar = new HeaderBar();
    this.multiplierText = new MultiplierText();
    this.cashoutButton = new CashoutButton();
    this.potDisplay = new PotDisplay();
    this.playersPanel = new PlayersPanel();

    this.buttonLabel = new Text('', new TextStyle({
      fontFamily: '"Courier New", monospace', fontSize: 11,
      fontWeight: 'bold', fill: 0x888888, align: 'center',
    }));
    this.buttonLabel.anchor.set(0.5, 0);

    this.balanceText = new Text('', new TextStyle({
      fontFamily: '"Courier New", monospace', fontSize: 13,
      fontWeight: 'bold', fill: 0x00ff88,
    }));
    this.balanceText.anchor.set(0.5, 0);

    this.endFlash = new Graphics();
    this.endFlash.beginFill(0xff4400, 0.4);
    this.endFlash.drawRect(0, 0, 4000, 4000);
    this.endFlash.endFill();
    this.endFlash.alpha = 0;

    this.winFlash = new Graphics();

    this.headerBar.onBack = () => {
      this.socket.send({ type: 'leaveRoom' });
      this.onLeaveTable?.();
    };
    this.cashoutButton.onTap = () => this.handleButtonTap();

    this.container.addChild(this.playersPanel);
    this.container.addChild(this.potDisplay);
    this.container.addChild(this.multiplierText);
    this.container.addChild(this.cashoutButton);
    this.container.addChild(this.buttonLabel);
    this.container.addChild(this.balanceText);
    this.container.addChild(this.endFlash);
    this.container.addChild(this.winFlash);
    this.container.addChild(this.headerBar);
  }

  show() {
    this.balance = this.socket.balance;
    this.app.stage.addChild(this.container);
    this.layout();
    this.app.ticker.add(this.update, this);
    this.bindEvents();
    this.socket.send({ type: 'joinRoom', mode: 'tap' });
  }

  hide() {
    this.app.ticker.remove(this.update, this);
    this.unbindEvents();
    this.clearWinAnimation();
    this.playerPendingNextRound = false;
    this.phase = 'IDLE';
    this.app.stage.removeChild(this.container);
  }

  // ── Server events ──

  private bindEvents() {
    const bind = (type: string, fn: (msg: ServerMessage) => void) => {
      this.socket.on(type, fn); this.handlers.push([type, fn]);
    };
    bind('roomState', (m) => this.onRoomState(m as RoomStateMsg));
    bind('phaseChange', (m) => this.onPhaseChange(m as PhaseChangeMsg));
    bind('betPlaced', (m) => this.onBetPlaced(m as BetPlacedMsg));
    bind('playerTapped', (m) => this.onPlayerTapped(m as PlayerTappedMsg));
    bind('tick', (m) => this.onTick(m as TickMsg));
    bind('roundResult', (m) => this.onRoundResult(m as RoundResultMsg));
    bind('balanceUpdate', (m) => this.onBalanceUpdate(m as BalanceUpdateMsg));
    bind('playerJoined', (m) => this.onPlayerJoined(m as PlayerJoinedMsg));
    bind('playerLeft', (m) => this.onPlayerLeft(m as PlayerLeftMsg));
  }

  private unbindEvents() {
    for (const [type, fn] of this.handlers) this.socket.off(type, fn);
    this.handlers = [];
  }

  private onRoomState(msg: RoomStateMsg) {
    this.phase = msg.phase as Phase;
    this.pot = msg.pot;
    this.elapsed = msg.elapsed ?? 0;
    this.history = msg.history;
    this.lastTapperId = msg.lastTapperId ?? null;

    this.players.clear();
    this.playerOrder = [];
    for (const p of msg.players) {
      this.players.set(p.id, p); this.playerOrder.push(p.id);
    }

    this.myBet = false;
    this.myTapCount = 0;
    const myInfo = this.players.get(this.socket.playerId);
    if (myInfo?.inRound) { this.myBet = true; this.myTapCount = myInfo.tapCount ?? 0; }

    this.rebuildPlayerList();
    this.potDisplay.setPot(this.pot);
    this.headerBar.updateTapHistory(this.history);
    this.updateBalanceText();

    if (this.phase === 'BETTING') {
      this.bettingTimeLeft = msg.bettingTimeLeft ?? 0;
      this.enterBettingUI();
    } else if (this.phase === 'RUNNING') {
      this.enterRunningUI();
    }
  }

  private onPhaseChange(msg: PhaseChangeMsg) {
    this.phase = msg.phase as Phase;

    if (msg.phase === 'BETTING') {
      this.bettingTimeLeft = msg.bettingTimeLeft ?? 8;
      this.myBet = false;
      this.myTapCount = 0;
      this.lastTapperId = null;
      this.clearWinAnimation();

      for (const [, p] of this.players) { p.inRound = false; p.tapCount = 0; p.lastTapTime = undefined; }
      this.rebuildPlayerList();
      this.playersPanel.resetForBetting();
      this.potDisplay.setPot(this.pot);
      this.potDisplay.hideTotalBet();
      this.headerBar.updateTapHistory(this.history);
      this.multiplierText.scale.set(1);

      if (this.playerPendingNextRound && this.balance >= FIXED_BET) {
        this.socket.send({ type: 'placeBet' });
        this.playerPendingNextRound = false;
      }
      this.enterBettingUI();
    } else if (msg.phase === 'RUNNING') {
      this.elapsed = 0;
      this.lastTapperId = null;
      this.multiplierText.reset();
      this.endFlash.alpha = 0;
      this.playersPanel.showOnlyBettingPlayers();
      this.enterRunningUI();
    } else if (msg.phase === 'ENDED') {
      const duration = msg.duration ?? this.elapsed;
      this.elapsed = duration;
      this.labelBlinkPhase = 0;
      this.buttonLabel.alpha = 1;
      this.cashoutButton.hideTapCount();
      this.endFlash.alpha = 0.6;
      this.multiplierText.showEnded(duration);
      this.history.push(parseFloat(duration.toFixed(1)));

      if (this.myBet) {
        this.cashoutButton.showTimeUp();
        const isWinner = this.lastTapperId === this.socket.playerId;
        this.setButtonLabel(isWinner ? 'YOU WON!' : 'TIME UP', isWinner ? 0x00ff88 : 0xff4444);
      }

      this.resultTimer = 2;
    }
  }

  private onBetPlaced(msg: BetPlacedMsg) {
    this.pot = msg.pot;
    this.potDisplay.setPot(this.pot);
    this.potDisplay.flash();

    const p = this.players.get(msg.playerId);
    if (p) p.inRound = true;

    if (msg.playerId === this.socket.playerId) {
      this.myBet = true;
      this.balance = this.socket.balance;
      this.cashoutButton.showBetPlaced();
      this.setButtonLabel(`BET $${FIXED_BET}`, 0xffee88);
      this.potDisplay.setTotalBet(FIXED_BET, false);
      this.updateBalanceText();
    }

    const idx = this.playerOrder.indexOf(msg.playerId);
    if (idx >= 0) this.playersPanel.setPlayerBetting(idx, true);
  }

  private onPlayerTapped(msg: PlayerTappedMsg) {
    this.pot = msg.pot;
    this.potDisplay.setPot(this.pot);
    this.potDisplay.flash();
    this.lastTapperId = msg.playerId;

    const p = this.players.get(msg.playerId);
    if (p) { p.tapCount = msg.tapCount; p.lastTapTime = msg.tapTime; }

    const idx = this.playerOrder.indexOf(msg.playerId);
    if (idx >= 0) {
      const isLast = msg.playerId === this.lastTapperId;
      this.playersPanel.updateTapStatus(idx, msg.tapCount, isLast, msg.tapTime);
    }

    if (msg.playerId === this.socket.playerId) {
      this.myTapCount = msg.tapCount;
      this.balance = this.socket.balance;
      this.updateBalanceText();
      this.cashoutButton.setTapCount(this.myTapCount, MAX_TAPS);

      const extraTaps = Math.max(0, this.myTapCount - 1);
      this.potDisplay.setTotalBet(FIXED_BET + extraTaps * FIXED_BET, true);
    }

    this.updateTapButtonLabel();
    this.updateAllTapHighlights();
    this.playersPanel.sortForTapRound();
  }

  private onTick(msg: TickMsg) {
    if (this.phase !== 'RUNNING') return;
    this.elapsed = msg.elapsed;
    this.pot = msg.pot;
    this.potDisplay.setPot(this.pot);
  }

  private onRoundResult(msg: RoundResultMsg) {
    this.phase = 'RESULT';
    this.balance = this.socket.balance;
    this.updateBalanceText();
    this.potDisplay.setPot(0);
    this.resultTimer = 3;

    if (msg.winnerId) {
      const isMe = msg.winnerId === this.socket.playerId;
      this.startWinDisplay(msg.winnerName ?? '???', msg.potWon, isMe);
    }
  }

  private onBalanceUpdate(msg: BalanceUpdateMsg) {
    this.balance = msg.balance;
    this.updateBalanceText();
  }

  private onPlayerJoined(msg: PlayerJoinedMsg) {
    this.players.set(msg.player.id, msg.player);
    this.playerOrder.push(msg.player.id);
    this.rebuildPlayerList();
  }

  private onPlayerLeft(msg: PlayerLeftMsg) {
    this.players.delete(msg.playerId);
    this.playerOrder = this.playerOrder.filter(id => id !== msg.playerId);
    this.rebuildPlayerList();
  }

  // ── UI helpers ──

  private enterBettingUI() {
    if (this.myBet) {
      this.cashoutButton.showBetPlaced();
      this.setButtonLabel(`BET $${FIXED_BET}`, 0xffee88);
    } else if (this.balance >= FIXED_BET) {
      this.cashoutButton.showBetMode(FIXED_BET);
      this.setButtonLabel(`BET $${FIXED_BET}`, 0xffee88);
    } else {
      this.cashoutButton.showNotInRound();
      this.setButtonLabel('', 0x888888);
    }
    this.updateBalanceText();
  }

  private enterRunningUI() {
    if (this.myBet) {
      this.cashoutButton.showTapMode();
      this.cashoutButton.setTapCount(this.myTapCount, MAX_TAPS);
      this.setButtonLabel('TAP!', 0xff8800);
    } else if (this.balance >= FIXED_BET) {
      if (this.playerPendingNextRound) {
        this.cashoutButton.showNextRoundQueued(FIXED_BET);
        this.setButtonLabel(`QUEUED $${FIXED_BET}\nTAP TO CANCEL`, 0x88ccff);
      } else {
        this.cashoutButton.showNextRoundMode(FIXED_BET);
        this.setButtonLabel(`BET NEXT $${FIXED_BET}`, 0x88aadd);
      }
      this.cashoutButton.hideTapCount();
    } else {
      this.cashoutButton.showNotInRound();
      this.cashoutButton.hideTapCount();
      this.setButtonLabel('', 0x888888);
    }
    this.updateBalanceText();
  }

  private updateTapButtonLabel() {
    if (!this.myBet || this.phase !== 'RUNNING') return;
    if (this.myTapCount >= MAX_TAPS) {
      this.cashoutButton.showTapDisabled();
      this.setButtonLabel('MAX TAPS', 0x888888);
    } else if (this.myTapCount > 0 && this.balance < FIXED_BET) {
      this.cashoutButton.showTapDisabled();
      this.setButtonLabel('NO FUNDS', 0xff4444);
    } else {
      const label = this.myTapCount > 0 ? 'BET MORE TO WIN' : 'TAP TO BET';
      this.setButtonLabel(label, this.myTapCount > 0 ? 0xffdd00 : 0xff8800);
    }
  }

  private updateAllTapHighlights() {
    for (const [id, p] of this.players) {
      if (!p.inRound || (p.tapCount ?? 0) === 0) continue;
      const idx = this.playerOrder.indexOf(id);
      if (idx < 0) continue;
      this.playersPanel.updateTapStatus(idx, p.tapCount ?? 0, id === this.lastTapperId, p.lastTapTime ?? -1);
    }
  }

  private rebuildPlayerList() {
    const rows: PlayerRowData[] = this.playerOrder.map(id => {
      const p = this.players.get(id)!;
      const isMe = id === this.socket.playerId;
      return {
        name: isMe ? 'YOU' : p.nickname,
        neonColor: isMe ? 0x00ff88 : nickColor(p.nickname),
        isPlayer: isMe,
        status: null,
        inRound: p.inRound,
        tapCount: p.tapCount ?? 0,
      };
    });
    this.playersPanel.setPlayers(rows);
    this.layoutPlayersPanel();
  }

  // ── Frame update ──

  private update() {
    const dt = this.app.ticker.deltaMS / 1000;
    this.potDisplay.animate(dt);

    switch (this.phase) {
      case 'BETTING': this.updateBetting(dt); break;
      case 'RUNNING': this.updateRunning(dt); break;
      case 'ENDED': this.updateEnded(dt); break;
      case 'RESULT': this.updateResult(dt); break;
    }
  }

  private updateBetting(dt: number) {
    this.bettingTimeLeft = Math.max(0, this.bettingTimeLeft - dt);
    this.multiplierText.showBetting(this.bettingTimeLeft, this.myBet);
    const progress = this.bettingTimeLeft / 8;
    this.cashoutButton.animateBetting(progress);
    if (!this.myBet) {
      this.cashoutButton.setCountdown(Math.ceil(this.bettingTimeLeft));
      this.cashoutButton.pulseBetting(dt);
    }
  }

  private updateRunning(dt: number) {
    this.elapsed += dt;
    this.multiplierText.showElapsedTime(this.elapsed);
    this.multiplierText.animate(dt);

    if (this.myBet) {
      this.cashoutButton.animateTap(dt, this.elapsed);
      if (this.myTapCount > 0) {
        this.labelBlinkPhase += dt * 4;
        this.buttonLabel.alpha = 0.5 + 0.5 * Math.abs(Math.sin(this.labelBlinkPhase));
      } else {
        this.labelBlinkPhase = 0;
        this.buttonLabel.alpha = 1;
      }
    }

    this.playersPanel.sortForTapRound();
    this.playersPanel.animate(dt);
  }

  private updateEnded(dt: number) {
    this.endFlash.alpha = Math.max(this.endFlash.alpha - dt * 2, 0);
    this.playersPanel.animate(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
  }

  private updateResult(dt: number) {
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.winAnnouncement && this.resultTimer < 1.0) {
      this.winAnnouncement.alpha = Math.max(0, this.resultTimer);
    }
  }

  // ── Player action ──

  private handleButtonTap() {
    if (this.phase === 'BETTING' && !this.myBet) {
      this.socket.send({ type: 'placeBet' });
    } else if (this.phase === 'RUNNING') {
      if (this.myBet) {
        this.socket.send({ type: 'tap' });
      } else {
        this.playerPendingNextRound = !this.playerPendingNextRound;
        if (this.playerPendingNextRound) {
          this.cashoutButton.showNextRoundQueued(FIXED_BET);
          this.setButtonLabel(`QUEUED $${FIXED_BET}\nTAP TO CANCEL`, 0x88ccff);
        } else {
          this.cashoutButton.showNextRoundMode(FIXED_BET);
          this.setButtonLabel(`BET NEXT $${FIXED_BET}`, 0x88aadd);
        }
      }
    }
  }

  // ── Win animation ──

  private startWinDisplay(name: string, payout: number, isPlayer: boolean) {
    this.clearWinAnimation();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const leftW = Math.floor(w * 0.26);
    const rightX = leftW + 1;
    const rightW = w - rightX;
    const headerH = HeaderBar.HEIGHT;
    const color = isPlayer ? 0x00ff88 : 0xff8800;

    const announcementX = rightX + rightW / 2;
    const announcementY = headerH + (h - headerH) * 0.12;

    this.winAnnouncement = new Text(
      `${name}\nWON $${Math.floor(payout).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily: '"Courier New", monospace', fontSize: 28, fontWeight: 'bold',
        fill: color, dropShadow: true, dropShadowColor: color,
        dropShadowBlur: 20, dropShadowDistance: 0, align: 'center',
      }),
    );
    this.winAnnouncement.anchor.set(0.5);
    this.winAnnouncement.x = announcementX;
    this.winAnnouncement.y = announcementY;

    const potPos = this.potDisplay.getPotCenter();
    this.winFlyFrom = potPos;
    this.winFlyTo = { x: announcementX, y: announcementY };
    this.winFlashPos = { x: announcementX, y: announcementY };
    this.winFlyT = 0;
    this.winFlashAlpha = 0;

    this.winFlyLabel = new Text(
      `pot $${Math.floor(payout).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily: '"Courier New", monospace', fontSize: 13, fontWeight: 'bold',
        fill: 0xffdd00, dropShadow: true, dropShadowColor: 0xffdd00,
        dropShadowBlur: 8, dropShadowDistance: 0,
      }),
    );
    this.winFlyLabel.anchor.set(0.5);
    this.winFlyLabel.x = potPos.x;
    this.winFlyLabel.y = potPos.y;

    const headerIdx = this.container.children.indexOf(this.headerBar);
    this.container.addChildAt(this.winAnnouncement, headerIdx);
    this.container.addChildAt(this.winFlyLabel, headerIdx);
  }

  private tickWinAnimation(dt: number) {
    if (!this.winFlyLabel && !this.winAnnouncement) return;
    if (this.winFlyLabel && this.winFlyT < 1) {
      this.winFlyT = Math.min(1, this.winFlyT + dt / 0.75);
      const t = easeOut(this.winFlyT);
      this.winFlyLabel.x = lerp(this.winFlyFrom.x, this.winFlyTo.x, t);
      this.winFlyLabel.y = lerp(this.winFlyFrom.y, this.winFlyTo.y, t);
      this.winFlyLabel.scale.set(1 - t * 0.35);
      if (this.winFlyT >= 1) { this.winFlyLabel.visible = false; this.winFlashAlpha = 1; }
    }
    if (this.winFlashAlpha > 0) {
      this.winFlashAlpha = Math.max(0, this.winFlashAlpha - dt / 0.5);
      this.winFlash.clear();
      if (this.winFlashAlpha > 0) {
        this.winFlash.beginFill(0xffffff, this.winFlashAlpha * 0.9);
        this.winFlash.drawCircle(this.winFlashPos.x, this.winFlashPos.y, 6 + (1 - this.winFlashAlpha) * 10);
        this.winFlash.endFill();
        this.winFlash.beginFill(0xff8800, this.winFlashAlpha * 0.45);
        this.winFlash.drawCircle(this.winFlashPos.x, this.winFlashPos.y, 18 + (1 - this.winFlashAlpha) * 24);
        this.winFlash.endFill();
      }
    }
  }

  private clearWinAnimation() {
    if (this.winAnnouncement) { this.container.removeChild(this.winAnnouncement); this.winAnnouncement.destroy(); this.winAnnouncement = null; }
    if (this.winFlyLabel) { this.container.removeChild(this.winFlyLabel); this.winFlyLabel.destroy(); this.winFlyLabel = null; }
    this.winFlash.clear();
    this.winFlashAlpha = 0;
    this.winFlyT = 0;
  }

  // ── Layout ──

  private layout() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const headerH = HeaderBar.HEIGHT;

    this.headerBar.x = 0;
    this.headerBar.y = 0;
    this.headerBar.layout(w);

    const leftW = Math.floor(w * 0.26);
    const rightX = leftW + 1;
    const rightW = w - rightX;

    this.layoutPlayersPanel();

    this.potDisplay.x = rightX;
    this.potDisplay.y = headerH;
    this.potDisplay.layout(rightW, 8);

    this.multiplierText.x = rightX + rightW / 2;
    this.multiplierText.y = headerH + (h - headerH) * 0.25;

    this.cashoutButton.x = rightX + rightW / 2;
    this.cashoutButton.y = headerH + (h - headerH) * 0.55;

    this.buttonLabel.x = rightX + rightW / 2;
    this.buttonLabel.y = headerH + (h - headerH) * 0.55 + 76;

    this.balanceText.x = rightX + rightW / 2;
    this.balanceText.y = headerH + (h - headerH) * 0.55 + 112;
  }

  private layoutPlayersPanel() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const headerH = HeaderBar.HEIGHT;
    const potAreaH = 48;
    this.playersPanel.x = 0;
    this.playersPanel.y = headerH + potAreaH;
    this.playersPanel.layout(w, h - headerH - potAreaH);
    this.playersPanel.alpha = 0.5;
  }

  onResize(_w: number, _h: number) { this.layout(); }

  private setButtonLabel(text: string, fill: number) {
    this.buttonLabel.text = text;
    (this.buttonLabel.style as TextStyle).fill = fill;
  }

  private updateBalanceText() {
    this.balance = this.socket.balance;
    this.balanceText.text = `balance $${this.balance.toLocaleString('en-US')}`;
  }
}
