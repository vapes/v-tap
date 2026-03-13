import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { RoundManager, GameState } from '../logic/RoundManager';
import { BotPlayers } from '../logic/BotPlayers';
import { MultiplierText } from '../ui/MultiplierText';
import { CashoutButton } from '../ui/CashoutButton';
import { PotDisplay } from '../ui/PotDisplay';
import { PlayersPanel } from '../ui/PlayersPanel';
import { ChatPanel } from '../ui/ChatPanel';
import { HeaderBar } from '../ui/HeaderBar';
import mathConfig from '../math-config.json';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

/** Index 0 = player (YOU), indices 1..N = bots */
const PLAYER_ROW = 0;

export class GameScene {
  private app:       Application;
  private container: Container;

  private roundManager: RoundManager;
  private botPlayers:   BotPlayers;

  private headerBar:      HeaderBar;
  private multiplierText: MultiplierText;
  private cashoutButton:  CashoutButton;
  private potDisplay:     PotDisplay;
  private playersPanel:   PlayersPanel;
  private chatPanel:      ChatPanel;
  private crashFlash:     Graphics;
  private balanceText:    Text;
  private buttonLabel:    Text;

  // Win animation
  private winFlash:        Graphics;
  private winAnnouncement: Text | null = null;
  private winFlyLabel:     Text | null = null;
  private winFlyFrom       = { x: 0, y: 0 };
  private winFlyTo         = { x: 0, y: 0 };
  private winFlyT          = 0;
  private winFlashAlpha    = 0;
  private winFlashPos      = { x: 0, y: 0 };
  private winName          = '';
  private winCashoutAmount = 0;
  private winPotAmount     = 0;
  private winPotMerged     = false;
  private winColor         = 0xffdd00;

  // Player cashout fly animation
  private playerWinFlyLabel: Text | null = null;
  private playerWinFlyFrom  = { x: 0, y: 0 };
  private playerWinFlyTo    = { x: 0, y: 0 };
  private playerWinFlyT     = 0;
  private playerWinAmount   = 0;

  private bettingTimer          = 0;
  private resultTimer           = 0;
  private playerPendingNextRound = false;

  private readonly BETTING_DELAY = mathConfig.timing.bettingDelaySec;
  private readonly RESULT_DELAY  = mathConfig.timing.resultDelaySec;
  private readonly CRASH_DISPLAY = mathConfig.timing.crashDisplaySec;

  onLeaveTable: (() => void) | null = null;

  constructor(app: Application) {
    this.app       = app;
    this.container = new Container();

    this.roundManager = new RoundManager();
    this.botPlayers   = new BotPlayers(this.roundManager);

    this.headerBar      = new HeaderBar();
    this.multiplierText = new MultiplierText();
    this.cashoutButton  = new CashoutButton();
    this.potDisplay     = new PotDisplay();
    this.playersPanel   = new PlayersPanel();
    this.chatPanel      = new ChatPanel();

    this.buttonLabel = new Text('', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   11,
      fontWeight: 'bold',
      fill:       0x888888,
      align:      'center',
    }));
    this.buttonLabel.anchor.set(0.5, 0);

    this.balanceText = new Text('', new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize:   13,
      fontWeight: 'bold',
      fill:       0x00ff88,
    }));
    this.balanceText.anchor.set(0.5, 0);

    this.crashFlash = new Graphics();
    this.crashFlash.beginFill(0xff0000, 0.4);
    this.crashFlash.drawRect(0, 0, 4000, 4000);
    this.crashFlash.endFill();
    this.crashFlash.alpha = 0;

    this.winFlash = new Graphics();

    this.headerBar.onBack = () => this.onLeaveTable?.();

    this.botPlayers.onBotBetPlaced = (botIndex) => {
      this.playersPanel.setPlayerBetting(botIndex + 1, true);
      this.potDisplay.setPot(this.roundManager.potValue);
      this.potDisplay.flash();
    };

    this.botPlayers.onBotCashout = (botIndex, name, mult) => {
      this.playersPanel.updatePlayerStatus(botIndex + 1, mult);
      const bot = this.botPlayers.getBots()[botIndex];
      this.chatPanel.onBotWin(name, mult, bot?.neonColor ?? 0xcccccc);
    };

    this.cashoutButton.onTap = () => this.handleButtonTap();

    // Z-order: header always on top, win elements just below it
    this.container.addChild(this.playersPanel);
    this.container.addChild(this.potDisplay);
    this.container.addChild(this.multiplierText);
    this.container.addChild(this.cashoutButton);
    this.container.addChild(this.buttonLabel);
    this.container.addChild(this.balanceText);
    this.container.addChild(this.chatPanel);
    this.container.addChild(this.crashFlash);
    this.container.addChild(this.winFlash);
    this.container.addChild(this.headerBar);
  }

  getRoundManager(): RoundManager {
    return this.roundManager;
  }

  show(betAmount: number) {
    this.roundManager.setTableBet(betAmount);
    this.app.stage.addChild(this.container);
    this.rebuildPlayerList();
    this.layout();
    this.app.ticker.add(this.update, this);
    this.startBettingPhase();
  }

  hide() {
    this.app.ticker.remove(this.update, this);
    this.clearPlayerWinFly();
    this.roundManager.resetForLobby();
    this.playerPendingNextRound = false;
    this.clearWinAnimation();
    this.app.stage.removeChild(this.container);
  }

  private rebuildPlayerList() {
    const playerRow = {
      name:      'YOU',
      animalType: 'cat' as const,
      neonColor: 0x00ff88,
      bet:       0,
      balance:   this.roundManager.playerBalance,
      isPlayer:  true,
      status:    null as null,
      inRound:   false,
    };
    this.playersPanel.setPlayers([playerRow, ...this.botPlayers.getBotRows()]);
  }

  // ─── State handlers ────────────────────────────────────────────

  private update() {
    const dt = this.app.ticker.deltaMS / 1000;
    this.potDisplay.animate(dt);
    switch (this.roundManager.state) {
      case GameState.BETTING:  this.updateBetting(dt);  break;
      case GameState.RUNNING:  this.updateRunning(dt);  break;
      case GameState.CRASHED:  this.updateCrashed(dt);  break;
      case GameState.RESULT:   this.updateResult(dt);   break;
    }
  }

  private updateBetting(dt: number) {
    this.bettingTimer -= dt;
    const remaining = Math.max(this.bettingTimer, 0);
    this.multiplierText.showBetting(remaining);
    const elapsed = this.BETTING_DELAY - this.bettingTimer;
    this.botPlayers.tickBetting(elapsed, this.roundManager.tableBet);
    const progress = remaining / this.BETTING_DELAY;
    this.cashoutButton.animateBetting(progress);
    if (!this.roundManager.playerInRound) {
      this.cashoutButton.setCountdown(Math.ceil(remaining));
      this.cashoutButton.pulseBetting(dt);
    }
    if (this.bettingTimer <= 0) this.startRound();
  }

  private updateRunning(dt: number) {
    const crashed = this.roundManager.update(dt);
    this.botPlayers.update();
    this.tickPlayerWinFly(dt);

    if (crashed) { this.onCrash(); return; }

    this.multiplierText.setValue(this.roundManager.multiplier);
    this.multiplierText.animate(dt);

    if (this.roundManager.playerInRound && !this.roundManager.playerCashedOut) {
      this.cashoutButton.animate(dt, this.roundManager.multiplier);
    }

    this.playersPanel.sortForRound(this.roundManager.multiplier);
    this.playersPanel.animate(dt);

    this.chatPanel.animate(dt);

    const bots      = this.botPlayers.getBots();
    const randomBot = bots[Math.floor(Math.random() * bots.length)];
    if (randomBot && !randomBot.hasCashedOut && randomBot.betCommitted) {
      this.chatPanel.maybeRandomChat(randomBot.name, randomBot.neonColor);
    }
  }

  private updateCrashed(dt: number) {
    this.crashFlash.alpha = Math.max(this.crashFlash.alpha - dt * 2, 0);
    this.playersPanel.animate(dt);
    this.chatPanel.animate(dt);
    this.tickPlayerWinFly(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.resultTimer <= 0) {
      this.roundManager.showResult();
      this.showRoundResult();
    }
  }

  private updateResult(dt: number) {
    this.chatPanel.animate(dt);
    this.tickPlayerWinFly(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.resultTimer <= 0) {
      this.clearWinAnimation();
      this.startBettingPhase();
    }
  }

  // ─── Phase transitions ─────────────────────────────────────────

  private startBettingPhase() {
    // Safety flush — apply any pending cashout that wasn't caught earlier
    this.roundManager.applyPendingCashout();
    this.clearPlayerWinFly();
    this.roundManager.startBetting();
    this.botPlayers.prepareBettingPhase(this.BETTING_DELAY);
    this.bettingTimer = this.BETTING_DELAY;

    this.playersPanel.resetForBetting();
    this.potDisplay.setPot(this.roundManager.potValue);
    this.headerBar.updateHistory(this.roundManager.recentCrashes);
    this.multiplierText.showBetting(this.BETTING_DELAY);
    this.multiplierText.scale.set(1);

    if (this.playerPendingNextRound && this.roundManager.playerBalance >= this.roundManager.tableBet) {
      this.roundManager.playerJoinRound();
      this.playersPanel.setPlayerBetting(PLAYER_ROW, true);
      this.potDisplay.setPot(this.roundManager.potValue);
      this.potDisplay.flash();
      this.cashoutButton.showBetPlaced();
      this.setButtonLabel(`BET $${this.roundManager.tableBet}`, 0xffee88);
      this.playerPendingNextRound = false;
      this.updateBalanceText();
    } else {
      this.playerPendingNextRound = false;
      if (this.roundManager.playerBalance >= this.roundManager.tableBet) {
        this.cashoutButton.showBetMode(this.roundManager.tableBet);
        this.setButtonLabel(`BET $${this.roundManager.tableBet}`, 0xffee88);
      } else {
        this.cashoutButton.showNotInRound();
        this.setButtonLabel('', 0x888888);
      }
    }

    this.potDisplay.setPot(this.roundManager.potValue);
    this.updateBalanceText();
  }

  private startRound() {
    this.botPlayers.initRound();
    this.roundManager.startRound();
    this.multiplierText.reset();
    this.crashFlash.alpha = 0;

    const bots = this.botPlayers.getBots();
    for (let i = 0; i < bots.length; i++) {
      if (!bots[i].betCommitted) {
        this.playersPanel.updatePlayerStatus(i + 1, 'out');
      } else {
        this.playersPanel.updatePlayerStatus(i + 1, null);
      }
    }

    if (this.roundManager.playerInRound) {
      this.cashoutButton.showCashoutMode();
      this.setButtonLabel('CASH OUT', 0x888888);
      this.playersPanel.updatePlayerStatus(PLAYER_ROW, null);
    } else if (this.roundManager.playerBalance >= this.roundManager.tableBet) {
      if (this.playerPendingNextRound) {
        this.cashoutButton.showNextRoundQueued(this.roundManager.tableBet);
        this.setButtonLabel(`QUEUED $${this.roundManager.tableBet}\nTAP TO CANCEL`, 0x88ccff);
      } else {
        this.cashoutButton.showNextRoundMode(this.roundManager.tableBet);
        this.setButtonLabel(`BET NEXT $${this.roundManager.tableBet}`, 0x88aadd);
      }
      this.playersPanel.updatePlayerStatus(PLAYER_ROW, 'out');
    } else {
      this.cashoutButton.showNotInRound();
      this.setButtonLabel('', 0x888888);
      this.playersPanel.updatePlayerStatus(PLAYER_ROW, 'out');
    }

    this.updateBalanceText();
  }

  private onCrash() {
    this.crashFlash.alpha = 0.6;
    this.multiplierText.showCrash(this.roundManager.crashMultiplier);

    if (this.roundManager.playerInRound && !this.roundManager.playerCashedOut) {
      this.cashoutButton.showCrashed();
      this.setButtonLabel('BUST', 0xff4444);
      this.chatPanel.onPlayerLose();
      this.playersPanel.updatePlayerStatus(PLAYER_ROW, 'busted');
    }

    this.botPlayers.onCrash();
    const bots = this.botPlayers.getBots();
    for (let i = 0; i < bots.length; i++) {
      if (bots[i].betCommitted && !bots[i].hasCashedOut) {
        this.playersPanel.updatePlayerStatus(i + 1, 'busted');
        this.chatPanel.onBotLose(bots[i].name, bots[i].neonColor);
      }
    }

    const winner = this.roundManager.lastWinner;
    if (winner) {
      this.startCrashWinDisplay(winner.name, winner.cashoutAmount, this.roundManager.potValue, winner.isPlayer);
    }

    this.resultTimer = this.CRASH_DISPLAY;
  }

  private showRoundResult() {
    const winner = this.roundManager.lastWinner;
    const pot    = this.roundManager.potValue;

    if (winner) {
      if (!winner.isPlayer) {
        this.botPlayers.awardPotToBot(winner.name, pot);
      }
      this.roundManager.awardPot();
      // Win display already started in onCrash — just continue
    } else {
      this.showNobodyWon();
    }

    // If player cashed out this round, fly their payout to the balance now
    if (this.roundManager.playerPendingCashoutAmount > 0) {
      this.startPlayerWinFly(this.roundManager.playerPendingCashoutAmount);
    }

    this.potDisplay.setPot(this.roundManager.potValue);

    this.botPlayers.checkRebuy();
    this.updateBalanceText();
    this.resultTimer = this.RESULT_DELAY;
  }

  // ─── Player cashout fly ────────────────────────────────────────

  private startPlayerWinFly(amount: number) {
    this.clearPlayerWinFly();
    this.playerWinAmount  = amount;
    this.playerWinFlyT    = 0;
    this.playerWinFlyFrom = { x: this.cashoutButton.x, y: this.cashoutButton.y };
    this.playerWinFlyTo   = { x: this.balanceText.x,   y: this.balanceText.y   };

    this.playerWinFlyLabel = new Text(
      `YOU WON $${Math.floor(amount).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily:         '"Courier New", monospace',
        fontSize:           15,
        fontWeight:         'bold',
        fill:               0x00ff88,
        dropShadow:         true,
        dropShadowColor:    0x00ff88,
        dropShadowBlur:     10,
        dropShadowDistance: 0,
        align:              'center',
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
    this.playerWinFlyLabel.x     = lerp(this.playerWinFlyFrom.x, this.playerWinFlyTo.x, t);
    this.playerWinFlyLabel.y     = lerp(this.playerWinFlyFrom.y, this.playerWinFlyTo.y, t);
    this.playerWinFlyLabel.alpha = 1 - t * 0.6;
    this.playerWinFlyLabel.scale.set(1 - t * 0.3);

    if (this.playerWinFlyT >= 1) {
      this.roundManager.applyPendingCashout();
      this.clearPlayerWinFly();
      this.updateBalanceText();
    }
  }

  private clearPlayerWinFly() {
    if (this.playerWinFlyLabel) {
      this.container.removeChild(this.playerWinFlyLabel);
      this.playerWinFlyLabel.destroy();
      this.playerWinFlyLabel = null;
    }
    this.playerWinFlyT   = 0;
    this.playerWinAmount = 0;
  }

  // ─── Win animation ─────────────────────────────────────────────

  private startCrashWinDisplay(name: string, cashoutAmt: number, potAmt: number, isPlayer: boolean) {
    this.clearWinAnimation();

    const w       = this.app.screen.width;
    const h       = this.app.screen.height;
    const leftW   = Math.floor(w * 0.26);
    const rightX  = leftW + 1;
    const rightW  = w - rightX;
    const headerH = HeaderBar.HEIGHT;
    const color   = isPlayer ? 0x00ff88 : 0xffdd00;

    this.winName          = name;
    this.winCashoutAmount = cashoutAmt;
    this.winPotAmount     = potAmt;
    this.winPotMerged     = false;
    this.winColor         = color;

    const announcementX = rightX + rightW / 2;
    const announcementY = headerH + (h - headerH) * 0.12;

    this.winAnnouncement = new Text(
      `${name}\nWON $${Math.floor(cashoutAmt).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily:         '"Courier New", monospace',
        fontSize:           28,
        fontWeight:         'bold',
        fill:               color,
        dropShadow:         true,
        dropShadowColor:    color,
        dropShadowBlur:     20,
        dropShadowDistance: 0,
        align:              'center',
      }),
    );
    this.winAnnouncement.anchor.set(0.5);
    this.winAnnouncement.x = announcementX;
    this.winAnnouncement.y = announcementY;

    const potPos = this.potDisplay.getPotCenter();
    this.winFlyFrom  = potPos;
    this.winFlyTo    = { x: announcementX, y: announcementY };
    this.winFlashPos = { x: announcementX, y: announcementY };
    this.winFlyT     = 0;
    this.winFlashAlpha = 0;

    this.winFlyLabel = new Text(
      `pot +$${Math.floor(potAmt).toLocaleString('en-US')}`,
      new TextStyle({
        fontFamily:         '"Courier New", monospace',
        fontSize:           13,
        fontWeight:         'bold',
        fill:               0xffdd00,
        dropShadow:         true,
        dropShadowColor:    0xffdd00,
        dropShadowBlur:     8,
        dropShadowDistance: 0,
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
        this.winPotMerged  = true;
        if (this.winAnnouncement) {
          const total = this.winCashoutAmount + this.winPotAmount;
          this.winAnnouncement.text = `${this.winName}\nWON $${Math.floor(total).toLocaleString('en-US')}`;
        }
      }
    }

    if (this.winFlashAlpha > 0) {
      this.winFlashAlpha = Math.max(0, this.winFlashAlpha - dt / 0.5);
      this.drawWinFlash(this.winFlashPos.x, this.winFlashPos.y, this.winFlashAlpha);
    }

    if (this.winAnnouncement && this.roundManager.state === GameState.RESULT && this.resultTimer < 1.0) {
      this.winAnnouncement.alpha = Math.max(0, this.resultTimer);
    }
  }

  private drawWinFlash(x: number, y: number, alpha: number) {
    this.winFlash.clear();
    if (alpha <= 0) return;
    this.winFlash.beginFill(0xffffff, alpha * 0.9);
    this.winFlash.drawCircle(x, y, 6 + (1 - alpha) * 10);
    this.winFlash.endFill();
    this.winFlash.beginFill(0xffdd00, alpha * 0.45);
    this.winFlash.drawCircle(x, y, 18 + (1 - alpha) * 24);
    this.winFlash.endFill();
  }

  private showNobodyWon() {
    this.clearWinAnimation();
    const w       = this.app.screen.width;
    const h       = this.app.screen.height;
    const leftW   = Math.floor(w * 0.26);
    const rightX  = leftW + 1;
    const rightW  = w - rightX;
    const headerH = HeaderBar.HEIGHT;

    this.winAnnouncement = new Text(
      'NOBODY WON',
      new TextStyle({
        fontFamily:         '"Courier New", monospace',
        fontSize:           17,
        fontWeight:         'bold',
        fill:               0xff4444,
        dropShadow:         true,
        dropShadowColor:    0xff4444,
        dropShadowBlur:     14,
        dropShadowDistance: 0,
        align:              'center',
      }),
    );
    this.winAnnouncement.anchor.set(0.5);
    this.winAnnouncement.x = rightX + rightW / 2;
    this.winAnnouncement.y = headerH + (h - headerH) * 0.35;
    this.container.addChild(this.winAnnouncement);
  }

  private clearWinAnimation() {
    if (this.winAnnouncement) {
      this.container.removeChild(this.winAnnouncement);
      this.winAnnouncement.destroy();
      this.winAnnouncement = null;
    }
    if (this.winFlyLabel) {
      this.container.removeChild(this.winFlyLabel);
      this.winFlyLabel.destroy();
      this.winFlyLabel = null;
    }
    this.winFlash.clear();
    this.winFlashAlpha    = 0;
    this.winFlyT          = 0;
    this.winPotMerged     = false;
    this.winName          = '';
    this.winCashoutAmount = 0;
    this.winPotAmount     = 0;
  }

  // ─── Player action ─────────────────────────────────────────────

  private handleButtonTap() {
    if (this.roundManager.state === GameState.BETTING) {
      const joined = this.roundManager.playerJoinRound();
      if (joined) {
        this.cashoutButton.showBetPlaced();
        // label stays as "BET $XX" — no change here
        this.playersPanel.setPlayerBetting(PLAYER_ROW, true);
        this.potDisplay.setPot(this.roundManager.potValue);
        this.potDisplay.flash();
        this.updateBalanceText();
      }
    } else if (this.roundManager.state === GameState.RUNNING) {
      if (this.roundManager.playerInRound) {
        const mult = this.roundManager.playerCashout();
        if (mult > 0) {
          this.cashoutButton.showCashedOut(mult);
          this.setButtonLabel(`${mult.toFixed(2)}×`, 0x00ff88);
          this.playersPanel.updatePlayerStatus(PLAYER_ROW, mult);
          this.chatPanel.onPlayerWin(mult);
        }
      } else {
        this.playerPendingNextRound = !this.playerPendingNextRound;
        if (this.playerPendingNextRound) {
          this.cashoutButton.showNextRoundQueued(this.roundManager.tableBet);
          this.setButtonLabel(`QUEUED $${this.roundManager.tableBet}\nTAP TO CANCEL`, 0x88ccff);
        } else {
          this.cashoutButton.showNextRoundMode(this.roundManager.tableBet);
          this.setButtonLabel(`BET NEXT $${this.roundManager.tableBet}`, 0x88aadd);
        }
      }
    }
  }

  // ─── Layout ────────────────────────────────────────────────────

  private layout() {
    const w       = this.app.screen.width;
    const h       = this.app.screen.height;
    const headerH = HeaderBar.HEIGHT;

    this.headerBar.x = 0;
    this.headerBar.y = 0;
    this.headerBar.layout(w);

    const leftW  = Math.floor(w * 0.26);
    const rightX = leftW + 1;
    const rightW = w - rightX;

    this.playersPanel.x = 0;
    this.playersPanel.y = headerH;
    this.playersPanel.layout(leftW, h - headerH);

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

    const chatTop = headerH + Math.floor((h - headerH) * 0.70);
    this.chatPanel.layout(rightX, chatTop, rightW, h - chatTop);
  }

  onResize(_width: number, _height: number) {
    this.layout();
  }

  private setButtonLabel(text: string, fill: number) {
    this.buttonLabel.text = text;
    (this.buttonLabel.style as TextStyle).fill = fill;
  }

  private updateBalanceText() {
    const bal = this.roundManager.playerBalance;
    this.balanceText.text = `balance $${bal.toLocaleString('en-US')}`;
  }
}
