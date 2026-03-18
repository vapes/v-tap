import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SocketClient } from '../network/SocketClient';
import type {
  ServerMessage, RoomStateMsg, PhaseChangeMsg, BetPlacedMsg,
  PlayerCashedOutMsg, TickMsg, RoundResultMsg, BalanceUpdateMsg,
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

type Phase = 'BETTING' | 'RUNNING' | 'CRASHED' | 'RESULT' | 'IDLE';

export class GameScene {
  private app: Application;
  private container: Container;
  private socket: SocketClient;

  private headerBar: HeaderBar;
  private multiplierText: MultiplierText;
  private cashoutButton: CashoutButton;
  private potDisplay: PotDisplay;
  private playersPanel: PlayersPanel;
  private crashFlash: Graphics;
  private balanceText: Text;
  private buttonLabel: Text;

  // Win animation
  private winFlash: Graphics;
  private winAnnouncement: Text | null = null;
  private winFlyLabel: Text | null = null;
  private winFlyFrom = { x: 0, y: 0 };
  private winFlyTo = { x: 0, y: 0 };
  private winFlyT = 0;
  private winFlashAlpha = 0;
  private winFlashPos = { x: 0, y: 0 };
  private winPotMerged = false;

  // Player cashout fly
  private playerWinFlyLabel: Text | null = null;
  private playerWinFlyFrom = { x: 0, y: 0 };
  private playerWinFlyTo = { x: 0, y: 0 };
  private playerWinFlyT = 0;

  // Game state (driven by server)
  private phase: Phase = 'IDLE';
  private multiplier = 1.0;
  private growthRate = 0.2;
  private localElapsed = 0;
  private pot = 0;
  private balance = 0;
  private myBet = false;
  private myCashedOut = false;
  private bettingTimeLeft = 0;
  private history: number[] = [];
  private soloRound = false;

  private players = new Map<string, PlayerInfo>();
  private playerOrder: string[] = [];
  private playerPendingNextRound = false;
  private resultTimer = 0;

  onLeaveTable: (() => void) | null = null;

  // Event handler references for cleanup
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

    this.crashFlash = new Graphics();
    this.crashFlash.beginFill(0xff0000, 0.4);
    this.crashFlash.drawRect(0, 0, 4000, 4000);
    this.crashFlash.endFill();
    this.crashFlash.alpha = 0;

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
    this.container.addChild(this.crashFlash);
    this.container.addChild(this.winFlash);
    this.container.addChild(this.headerBar);
  }

  show() {
    this.balance = this.socket.balance;
    this.app.stage.addChild(this.container);
    this.layout();
    this.app.ticker.add(this.update, this);
    this.bindEvents();
    this.socket.send({ type: 'joinRoom', mode: 'crash' });
  }

  hide() {
    this.app.ticker.remove(this.update, this);
    this.unbindEvents();
    this.clearPlayerWinFly();
    this.clearWinAnimation();
    this.playerPendingNextRound = false;
    this.phase = 'IDLE';
    this.app.stage.removeChild(this.container);
  }

  // ── Server event binding ──

  private bindEvents() {
    const bind = (type: string, fn: (msg: ServerMessage) => void) => {
      this.socket.on(type, fn);
      this.handlers.push([type, fn]);
    };
    bind('roomState', (m) => this.onRoomState(m as RoomStateMsg));
    bind('phaseChange', (m) => this.onPhaseChange(m as PhaseChangeMsg));
    bind('betPlaced', (m) => this.onBetPlaced(m as BetPlacedMsg));
    bind('playerCashedOut', (m) => this.onPlayerCashedOut(m as PlayerCashedOutMsg));
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

  // ── Server event handlers ──

  private onRoomState(msg: RoomStateMsg) {
    this.phase = msg.phase as Phase;
    this.pot = msg.pot;
    this.multiplier = msg.multiplier ?? 1;
    this.growthRate = msg.growthRate ?? 0.2;
    this.localElapsed = msg.elapsed ?? 0;
    this.history = msg.history;

    this.players.clear();
    this.playerOrder = [];
    for (const p of msg.players) {
      this.players.set(p.id, p);
      this.playerOrder.push(p.id);
    }

    this.myBet = false;
    this.myCashedOut = false;
    const myInfo = this.players.get(this.socket.playerId);
    if (myInfo?.inRound) {
      this.myBet = true;
      this.myCashedOut = !!myInfo.cashedOut;
    }

    this.soloRound = this.countBettors() <= 1;
    this.rebuildPlayerList();
    this.potDisplay.setPot(this.pot);
    this.headerBar.updateHistory(this.history);
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
      this.bettingTimeLeft = msg.bettingTimeLeft ?? 10;
      this.myBet = false;
      this.myCashedOut = false;
      this.soloRound = false;
      this.clearWinAnimation();
      this.clearPlayerWinFly();

      for (const [, p] of this.players) { p.inRound = false; p.cashedOut = false; p.cashoutMultiplier = undefined; }
      this.rebuildPlayerList();
      this.playersPanel.resetForBetting();
      this.potDisplay.setPot(this.pot);
      this.headerBar.updateHistory(this.history);
      this.multiplierText.scale.set(1);

      if (this.playerPendingNextRound && this.balance >= 10) {
        this.socket.send({ type: 'placeBet' });
        this.playerPendingNextRound = false;
      }
      this.enterBettingUI();
    } else if (msg.phase === 'RUNNING') {
      this.growthRate = msg.growthRate ?? 0.2;
      this.localElapsed = 0;
      this.multiplier = 1.0;
      this.multiplierText.reset();
      this.crashFlash.alpha = 0;
      this.soloRound = this.countBettors() <= 1;
      this.playersPanel.showOnlyBettingPlayers();
      this.enterRunningUI();
    } else if (msg.phase === 'CRASHED') {
      this.multiplier = msg.crashPoint ?? this.multiplier;
      this.history.push(parseFloat(this.multiplier.toFixed(2)));
      this.crashFlash.alpha = 0.6;
      this.multiplierText.showCrash(this.multiplier);
      this.resultTimer = 1.5;

      if (this.myBet && !this.myCashedOut) {
        this.cashoutButton.showCrashed();
        this.setButtonLabel('BUST', 0xff4444);
        this.updateMyPlayerStatus('busted');
      }

      for (const [id, p] of this.players) {
        if (p.inRound && !p.cashedOut && id !== this.socket.playerId) {
          this.updatePlayerStatusById(id, 'busted');
        }
      }
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
      this.setButtonLabel(`BET $10`, 0xffee88);
      this.updateBalanceText();
    }

    const idx = this.playerOrder.indexOf(msg.playerId);
    if (idx >= 0) this.playersPanel.setPlayerBetting(idx, true);
  }

  private onPlayerCashedOut(msg: PlayerCashedOutMsg) {
    const p = this.players.get(msg.playerId);
    if (p) { p.cashedOut = true; p.cashoutMultiplier = msg.multiplier; p.cashoutAmount = msg.cashoutAmount; }

    const idx = this.playerOrder.indexOf(msg.playerId);
    if (idx >= 0) this.playersPanel.updatePlayerStatus(idx, msg.multiplier);

    if (msg.playerId === this.socket.playerId) {
      this.myCashedOut = true;
      this.balance = this.socket.balance;
      this.cashoutButton.showCashedOut(msg.multiplier);
      this.setButtonLabel(`${msg.multiplier.toFixed(2)}×`, 0x00ff88);
      this.updateBalanceText();
    }
  }

  private onTick(msg: TickMsg) {
    if (this.phase !== 'RUNNING') return;
    this.localElapsed = msg.elapsed;
    this.multiplier = msg.multiplier ?? this.multiplier;
    this.pot = msg.pot;
    this.potDisplay.setPot(this.pot);
  }

  private onRoundResult(msg: RoundResultMsg) {
    this.phase = 'RESULT';
    this.balance = this.socket.balance;
    this.updateBalanceText();
    this.potDisplay.setPot(0);
    this.resultTimer = 3;

    if (msg.winnerId && !this.soloRound) {
      const isMe = msg.winnerId === this.socket.playerId;
      const total = msg.winnerCashoutAmount + msg.potWon;
      this.startWinDisplay(msg.winnerName ?? '???', msg.winnerCashoutAmount, msg.potWon, isMe);
    }

    if (this.myCashedOut) {
      const myP = this.players.get(this.socket.playerId);
      if (myP?.cashoutAmount) {
        this.startPlayerWinFly(myP.cashoutAmount);
      }
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
      this.setButtonLabel(`BET $10`, 0xffee88);
    } else if (this.balance >= 10) {
      this.cashoutButton.showBetMode(10);
      this.setButtonLabel(`BET $10`, 0xffee88);
    } else {
      this.cashoutButton.showNotInRound();
      this.setButtonLabel('', 0x888888);
    }
    this.updateBalanceText();
  }

  private enterRunningUI() {
    if (this.myBet) {
      if (this.myCashedOut) {
        this.cashoutButton.showCashedOut(this.multiplier);
      } else {
        this.cashoutButton.showCashoutMode();
        this.setButtonLabel('CASH OUT', 0x888888);
      }
    } else if (this.balance >= 10) {
      if (this.playerPendingNextRound) {
        this.cashoutButton.showNextRoundQueued(10);
        this.setButtonLabel('QUEUED $10\nTAP TO CANCEL', 0x88ccff);
      } else {
        this.cashoutButton.showNextRoundMode(10);
        this.setButtonLabel('BET NEXT $10', 0x88aadd);
      }
    } else {
      this.cashoutButton.showNotInRound();
      this.setButtonLabel('', 0x888888);
    }
    this.updateBalanceText();
  }

  private countBettors(): number {
    let n = 0;
    for (const [, p] of this.players) if (p.inRound) n++;
    return n;
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
      };
    });
    this.playersPanel.setPlayers(rows);
    this.layoutPlayersPanel();
  }

  private updateMyPlayerStatus(status: null | number | 'busted' | 'out') {
    const idx = this.playerOrder.indexOf(this.socket.playerId);
    if (idx >= 0) this.playersPanel.updatePlayerStatus(idx, status);
  }

  private updatePlayerStatusById(id: string, status: null | number | 'busted' | 'out') {
    const idx = this.playerOrder.indexOf(id);
    if (idx >= 0) this.playersPanel.updatePlayerStatus(idx, status);
  }

  // ── Frame update ──

  private update() {
    const dt = this.app.ticker.deltaMS / 1000;
    this.potDisplay.animate(dt);

    switch (this.phase) {
      case 'BETTING': this.updateBetting(dt); break;
      case 'RUNNING': this.updateRunning(dt); break;
      case 'CRASHED': this.updateCrashed(dt); break;
      case 'RESULT': this.updateResult(dt); break;
    }
  }

  private updateBetting(dt: number) {
    this.bettingTimeLeft = Math.max(0, this.bettingTimeLeft - dt);
    this.multiplierText.showBetting(this.bettingTimeLeft, this.myBet);
    const progress = this.bettingTimeLeft / 10;
    this.cashoutButton.animateBetting(progress);
    if (!this.myBet) {
      this.cashoutButton.setCountdown(Math.ceil(this.bettingTimeLeft));
      this.cashoutButton.pulseBetting(dt);
    }
  }

  private updateRunning(dt: number) {
    this.localElapsed += dt;
    this.multiplier = Math.exp(this.localElapsed * this.growthRate);

    this.multiplierText.setValue(this.multiplier);
    this.multiplierText.animate(dt);

    if (this.myBet && !this.myCashedOut) {
      this.cashoutButton.animate(dt, this.multiplier);
    }

    this.playersPanel.sortForRound(this.multiplier);
    this.playersPanel.animate(dt);
    this.tickPlayerWinFly(dt);
  }

  private updateCrashed(dt: number) {
    this.crashFlash.alpha = Math.max(this.crashFlash.alpha - dt * 2, 0);
    this.playersPanel.animate(dt);
    this.tickPlayerWinFly(dt);
    this.tickWinAnimation(dt);
  }

  private updateResult(dt: number) {
    this.tickPlayerWinFly(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.resultTimer < 1.0 && this.winAnnouncement) {
      this.winAnnouncement.alpha = Math.max(0, this.resultTimer);
    }
  }

  // ── Player action ──

  private handleButtonTap() {
    if (this.phase === 'BETTING' && !this.myBet) {
      this.socket.send({ type: 'placeBet' });
    } else if (this.phase === 'RUNNING') {
      if (this.myBet && !this.myCashedOut) {
        this.socket.send({ type: 'cashout' });
      } else if (!this.myBet) {
        this.playerPendingNextRound = !this.playerPendingNextRound;
        if (this.playerPendingNextRound) {
          this.cashoutButton.showNextRoundQueued(10);
          this.setButtonLabel('QUEUED $10\nTAP TO CANCEL', 0x88ccff);
        } else {
          this.cashoutButton.showNextRoundMode(10);
          this.setButtonLabel('BET NEXT $10', 0x88aadd);
        }
      }
    }
  }

  // ── Win animation ──

  private startWinDisplay(name: string, cashoutAmt: number, potAmt: number, isPlayer: boolean) {
    this.clearWinAnimation();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const leftW = Math.floor(w * 0.26);
    const rightX = leftW + 1;
    const rightW = w - rightX;
    const headerH = HeaderBar.HEIGHT;
    const color = isPlayer ? 0x00ff88 : 0xffdd00;

    const announcementX = rightX + rightW / 2;
    const announcementY = headerH + (h - headerH) * 0.12;
    const total = cashoutAmt + potAmt;

    this.winAnnouncement = new Text(
      `${name}\nWON $${Math.floor(cashoutAmt).toLocaleString('en-US')}`,
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
    this.winPotMerged = false;

    this.winFlyLabel = new Text(
      `pot +$${Math.floor(potAmt).toLocaleString('en-US')}`,
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

    if (this.winFlyLabel && !this.winPotMerged && this.winFlyT < 1) {
      this.winFlyT = Math.min(1, this.winFlyT + dt / 0.75);
      const t = easeOut(this.winFlyT);
      this.winFlyLabel.x = lerp(this.winFlyFrom.x, this.winFlyTo.x, t);
      this.winFlyLabel.y = lerp(this.winFlyFrom.y, this.winFlyTo.y, t);
      this.winFlyLabel.scale.set(1 - t * 0.35);
      if (this.winFlyT >= 1) {
        this.winFlyLabel.visible = false;
        this.winFlashAlpha = 1;
        this.winPotMerged = true;
      }
    }

    if (this.winFlashAlpha > 0) {
      this.winFlashAlpha = Math.max(0, this.winFlashAlpha - dt / 0.5);
      this.winFlash.clear();
      if (this.winFlashAlpha > 0) {
        this.winFlash.beginFill(0xffffff, this.winFlashAlpha * 0.9);
        this.winFlash.drawCircle(this.winFlashPos.x, this.winFlashPos.y, 6 + (1 - this.winFlashAlpha) * 10);
        this.winFlash.endFill();
        this.winFlash.beginFill(0xffdd00, this.winFlashAlpha * 0.45);
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
    this.winPotMerged = false;
  }

  // ── Player cashout fly ──

  private startPlayerWinFly(amount: number) {
    this.clearPlayerWinFly();
    this.playerWinFlyT = 0;
    this.playerWinFlyFrom = { x: this.cashoutButton.x, y: this.cashoutButton.y };
    this.playerWinFlyTo = { x: this.balanceText.x, y: this.balanceText.y };

    this.playerWinFlyLabel = new Text(
      `YOU WON $${Math.floor(amount).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily: '"Courier New", monospace', fontSize: 15, fontWeight: 'bold',
        fill: 0x00ff88, dropShadow: true, dropShadowColor: 0x00ff88,
        dropShadowBlur: 10, dropShadowDistance: 0, align: 'center',
      }),
    );
    this.playerWinFlyLabel.anchor.set(0.5);
    this.playerWinFlyLabel.x = this.playerWinFlyFrom.x;
    this.playerWinFlyLabel.y = this.playerWinFlyFrom.y;

    const headerIdx = this.container.children.indexOf(this.headerBar);
    this.container.addChildAt(this.playerWinFlyLabel, headerIdx);
  }

  private tickPlayerWinFly(dt: number) {
    if (!this.playerWinFlyLabel) return;
    this.playerWinFlyT = Math.min(1, this.playerWinFlyT + dt / 0.9);
    const t = easeOut(this.playerWinFlyT);
    this.playerWinFlyLabel.x = lerp(this.playerWinFlyFrom.x, this.playerWinFlyTo.x, t);
    this.playerWinFlyLabel.y = lerp(this.playerWinFlyFrom.y, this.playerWinFlyTo.y, t);
    this.playerWinFlyLabel.alpha = 1 - t * 0.6;
    this.playerWinFlyLabel.scale.set(1 - t * 0.3);
    if (this.playerWinFlyT >= 1) { this.clearPlayerWinFly(); this.updateBalanceText(); }
  }

  private clearPlayerWinFly() {
    if (this.playerWinFlyLabel) { this.container.removeChild(this.playerWinFlyLabel); this.playerWinFlyLabel.destroy(); this.playerWinFlyLabel = null; }
    this.playerWinFlyT = 0;
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
