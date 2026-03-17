import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { TapRoundManager, TapGameState } from '../logic/TapRoundManager';
import { TapBotPlayers } from '../logic/TapBotPlayers';
import { MultiplierText } from '../ui/MultiplierText';
import { CashoutButton } from '../ui/CashoutButton';
import { PotDisplay } from '../ui/PotDisplay';
import { PlayersPanel } from '../ui/PlayersPanel';
import { ChatPanel } from '../ui/ChatPanel';
import { HeaderBar } from '../ui/HeaderBar';
import mathConfig from '../math-config.json';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

const PLAYER_ROW = 0;

export class TapGameScene {
  private app:       Application;
  private container: Container;

  private roundManager: TapRoundManager;
  private botPlayers:   TapBotPlayers;

  private headerBar:      HeaderBar;
  private multiplierText: MultiplierText;
  private cashoutButton:  CashoutButton;
  private potDisplay:     PotDisplay;
  private playersPanel:   PlayersPanel;
  private chatPanel:      ChatPanel;
  private endFlash:       Graphics;
  private balanceText:    Text;
  private buttonLabel:    Text;

  private winAnnouncement: Text | null = null;
  private winFlyLabel:     Text | null = null;
  private winFlyFrom       = { x: 0, y: 0 };
  private winFlyTo         = { x: 0, y: 0 };
  private winFlyT          = 0;
  private winFlash:        Graphics;
  private winFlashAlpha    = 0;
  private winFlashPos      = { x: 0, y: 0 };
  private winName          = '';
  private winPayout        = 0;
  private winColor         = 0xffdd00;

  private bettingTimer          = 0;
  private resultTimer           = 0;
  private playerPendingNextRound = false;

  private readonly BETTING_DELAY = mathConfig.tap.bettingDelaySec;
  private readonly RESULT_DELAY  = mathConfig.tap.resultDelaySec;
  private readonly ENDED_DISPLAY = mathConfig.tap.endedDisplaySec;

  onLeaveTable: (() => void) | null = null;

  constructor(app: Application) {
    this.app       = app;
    this.container = new Container();

    this.roundManager = new TapRoundManager();
    this.botPlayers   = new TapBotPlayers(this.roundManager);

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

    this.endFlash = new Graphics();
    this.endFlash.beginFill(0xff4400, 0.4);
    this.endFlash.drawRect(0, 0, 4000, 4000);
    this.endFlash.endFill();
    this.endFlash.alpha = 0;

    this.winFlash = new Graphics();

    this.headerBar.onBack = () => this.onLeaveTable?.();

    this.botPlayers.onBotBetPlaced = (botIndex) => {
      this.playersPanel.setPlayerBetting(botIndex + 1, true);
      this.potDisplay.setPot(this.roundManager.potValue);
      this.potDisplay.flash();
    };

    this.botPlayers.onBotTap = (botIndex, name) => {
      const bot = this.botPlayers.getBots()[botIndex];
      this.playersPanel.updateTapStatus(botIndex + 1, bot.tapCount, true, bot.lastTapTime);
      this.potDisplay.setPot(this.roundManager.potValue);
      this.potDisplay.flash();
      this.chatPanel.maybeRandomChat(name, bot.neonColor);
    };

    this.cashoutButton.onTap = () => this.handleButtonTap();

    this.container.addChild(this.playersPanel);
    this.container.addChild(this.potDisplay);
    this.container.addChild(this.multiplierText);
    this.container.addChild(this.cashoutButton);
    this.container.addChild(this.buttonLabel);
    this.container.addChild(this.balanceText);
    this.container.addChild(this.chatPanel);
    this.container.addChild(this.endFlash);
    this.container.addChild(this.winFlash);
    this.container.addChild(this.headerBar);
  }

  getRoundManager(): TapRoundManager {
    return this.roundManager;
  }

  show(betAmount: number) {
    this.roundManager.tableBet = betAmount;
    this.app.stage.addChild(this.container);
    this.rebuildPlayerList();
    this.layout();
    this.app.ticker.add(this.update, this);
    this.startBettingPhase();
  }

  hide() {
    this.app.ticker.remove(this.update, this);
    this.roundManager.resetForLobby();
    this.playerPendingNextRound = false;
    this.clearWinAnimation();
    this.app.stage.removeChild(this.container);
  }

  private rebuildPlayerList() {
    const playerRow = {
      name:       'YOU',
      animalType: 'cat' as const,
      neonColor:  0x00ff88,
      bet:        0,
      balance:    this.roundManager.playerBalance,
      isPlayer:   true,
      status:     null as null,
      inRound:    false,
      tapCount:   0,
    };
    this.playersPanel.setPlayers([playerRow, ...this.botPlayers.getBotRows()]);
  }

  // --- State handlers ---

  private update() {
    const dt = this.app.ticker.deltaMS / 1000;
    this.potDisplay.animate(dt);
    switch (this.roundManager.state) {
      case TapGameState.BETTING: this.updateBetting(dt); break;
      case TapGameState.RUNNING: this.updateRunning(dt); break;
      case TapGameState.ENDED:   this.updateEnded(dt);   break;
      case TapGameState.RESULT:  this.updateResult(dt);  break;
    }
  }

  private updateBetting(dt: number) {
    this.bettingTimer -= dt;
    const remaining = Math.max(this.bettingTimer, 0);
    this.multiplierText.showBetting(remaining);
    const elapsed = this.BETTING_DELAY - this.bettingTimer;
    this.botPlayers.tickBetting(elapsed);
    const progress = remaining / this.BETTING_DELAY;
    this.cashoutButton.animateBetting(progress);
    if (!this.roundManager.playerInRound) {
      this.cashoutButton.setCountdown(Math.ceil(remaining));
      this.cashoutButton.pulseBetting(dt);
    }
    if (this.bettingTimer <= 0) this.startRound();
  }

  private updateRunning(dt: number) {
    const ended = this.roundManager.update(dt);
    this.botPlayers.update();

    this.updateTapDisplay();

    if (ended) { this.onEnded(); return; }

    this.multiplierText.showElapsedTime(this.roundManager.elapsedTime);
    this.multiplierText.animate(dt);

    if (this.roundManager.playerInRound) {
      this.cashoutButton.animateTap(dt, this.roundManager.elapsedTime);
    }

    this.playersPanel.sortForTapRound();
    this.playersPanel.animate(dt);
    this.chatPanel.animate(dt);
  }

  private updateEnded(dt: number) {
    this.endFlash.alpha = Math.max(this.endFlash.alpha - dt * 2, 0);
    this.playersPanel.animate(dt);
    this.chatPanel.animate(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.resultTimer <= 0) {
      this.roundManager.showResult();
      this.showRoundResult();
    }
  }

  private updateResult(dt: number) {
    this.chatPanel.animate(dt);
    this.tickWinAnimation(dt);
    this.resultTimer -= dt;
    if (this.resultTimer <= 0) {
      this.clearWinAnimation();
      this.startBettingPhase();
    }
  }

  // --- Phase transitions ---

  private startBettingPhase() {
    this.clearWinAnimation();
    this.roundManager.startBetting();
    this.botPlayers.prepareBettingPhase(this.BETTING_DELAY);
    this.bettingTimer = this.BETTING_DELAY;

    this.playersPanel.resetForBetting();
    this.potDisplay.setPot(this.roundManager.potValue);
    this.potDisplay.hideTotalBet();
    this.headerBar.updateTapHistory(this.roundManager.recentDurations);
    this.multiplierText.showBetting(this.BETTING_DELAY);
    this.multiplierText.scale.set(1);

    if (this.playerPendingNextRound && this.roundManager.playerBalance >= this.roundManager.tableBet) {
      this.roundManager.playerJoinRound();
      this.playersPanel.setPlayerBetting(PLAYER_ROW, true);
      this.potDisplay.setPot(this.roundManager.potValue);
      this.potDisplay.setTotalBet(this.roundManager.tableBet, false);
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
    this.endFlash.alpha = 0;

    const bots = this.botPlayers.getBots();
    for (let i = 0; i < bots.length; i++) {
      if (!bots[i].betCommitted) {
        this.playersPanel.updatePlayerStatus(i + 1, 'out');
      } else {
        this.playersPanel.updatePlayerStatus(i + 1, null);
      }
    }

    if (this.roundManager.playerInRound) {
      this.cashoutButton.showTapMode();
      this.setButtonLabel('TAP!', 0xff8800);
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

  private updateTapDisplay() {
    const lastTapper = this.roundManager.lastTapper;
    const isPlayerLast = lastTapper?.isPlayer === true;

    if (this.roundManager.playerInRound) {
      const ptc = this.roundManager.playerTapCount;
      this.playersPanel.updateTapStatus(PLAYER_ROW, ptc, isPlayerLast, this.roundManager.playerLastTapTime);

      const extraTaps = Math.max(0, ptc - 1);
      const totalBet = this.roundManager.tableBet + extraTaps * this.roundManager.tableBet;
      this.potDisplay.setTotalBet(totalBet, isPlayerLast);
    }

    const bots = this.botPlayers.getBots();
    for (let i = 0; i < bots.length; i++) {
      if (!bots[i].betCommitted) continue;
      const isLast = lastTapper !== null && !lastTapper.isPlayer && lastTapper.name === bots[i].name;
      this.playersPanel.updateTapStatus(i + 1, bots[i].tapCount, isLast, bots[i].lastTapTime);
    }

    if (this.roundManager.playerInRound) {
      const maxTaps = mathConfig.tap.maxTaps;
      const ptc = this.roundManager.playerTapCount;

      if (ptc >= maxTaps) {
        this.cashoutButton.showTapDisabled();
        this.setButtonLabel(`MAX ${maxTaps}/${maxTaps}`, 0x888888);
      } else if (ptc > 0 && this.roundManager.playerBalance < this.roundManager.tableBet) {
        this.cashoutButton.showTapDisabled();
        this.setButtonLabel('NO FUNDS', 0xff4444);
      } else {
        const tapCostLabel = ptc > 0
          ? `TAP ${ptc}/${maxTaps} ($${this.roundManager.tableBet})`
          : `TAP 0/${maxTaps}`;
        this.setButtonLabel(tapCostLabel, 0xff8800);
      }
    }
  }

  private onEnded() {
    this.endFlash.alpha = 0.6;
    this.multiplierText.showEnded(this.roundManager.elapsedTime);

    if (this.roundManager.playerInRound) {
      this.cashoutButton.showTimeUp();
      const lastTapper = this.roundManager.lastTapper;
      if (lastTapper?.isPlayer) {
        this.setButtonLabel('YOU WON!', 0x00ff88);
      } else {
        this.setButtonLabel('TIME UP', 0xff4444);
        this.chatPanel.onPlayerLose();
      }
    }

    const lastTapper = this.roundManager.lastTapper;
    if (lastTapper) {
      this.startWinDisplay(
        lastTapper.name,
        this.roundManager.winnerPayout,
        lastTapper.isPlayer,
      );
    }

    this.resultTimer = this.ENDED_DISPLAY;
  }

  private showRoundResult() {
    const winner = this.roundManager.lastTapper;
    const payout = this.roundManager.winnerPayout;

    if (winner) {
      if (!winner.isPlayer) {
        this.botPlayers.awardPotToBot(winner.name, payout);
      }
      this.roundManager.awardPot();
    }

    this.potDisplay.setPot(this.roundManager.potValue);
    this.botPlayers.checkRebuy();
    this.updateBalanceText();
    this.resultTimer = this.RESULT_DELAY;
  }

  // --- Win animation ---

  private startWinDisplay(name: string, payout: number, isPlayer: boolean) {
    this.clearWinAnimation();

    const w       = this.app.screen.width;
    const h       = this.app.screen.height;
    const leftW   = Math.floor(w * 0.26);
    const rightX  = leftW + 1;
    const rightW  = w - rightX;
    const headerH = HeaderBar.HEIGHT;
    const color   = isPlayer ? 0x00ff88 : 0xff8800;

    this.winName   = name;
    this.winPayout = payout;
    this.winColor  = color;

    const announcementX = rightX + rightW / 2;
    const announcementY = headerH + (h - headerH) * 0.12;

    this.winAnnouncement = new Text(
      `${name}\nWON $${Math.floor(payout).toLocaleString('en-US')}`,
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
      `pot $${Math.floor(payout).toLocaleString('en-US')}`,
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

    if (this.winFlyLabel && this.winFlyT < 1) {
      this.winFlyT = Math.min(1, this.winFlyT + dt / 0.75);
      const t = easeOut(this.winFlyT);
      this.winFlyLabel.x = lerp(this.winFlyFrom.x, this.winFlyTo.x, t);
      this.winFlyLabel.y = lerp(this.winFlyFrom.y, this.winFlyTo.y, t);
      this.winFlyLabel.scale.set(1 - t * 0.35);
      if (this.winFlyT >= 1) {
        this.winFlyLabel.visible = false;
        this.winFlashAlpha = 1;
      }
    }

    if (this.winFlashAlpha > 0) {
      this.winFlashAlpha = Math.max(0, this.winFlashAlpha - dt / 0.5);
      this.drawWinFlash(this.winFlashPos.x, this.winFlashPos.y, this.winFlashAlpha);
    }

    if (this.winAnnouncement && this.roundManager.state === TapGameState.RESULT && this.resultTimer < 1.0) {
      this.winAnnouncement.alpha = Math.max(0, this.resultTimer);
    }
  }

  private drawWinFlash(x: number, y: number, alpha: number) {
    this.winFlash.clear();
    if (alpha <= 0) return;
    this.winFlash.beginFill(0xffffff, alpha * 0.9);
    this.winFlash.drawCircle(x, y, 6 + (1 - alpha) * 10);
    this.winFlash.endFill();
    this.winFlash.beginFill(0xff8800, alpha * 0.45);
    this.winFlash.drawCircle(x, y, 18 + (1 - alpha) * 24);
    this.winFlash.endFill();
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
    this.winFlashAlpha = 0;
    this.winFlyT       = 0;
    this.winName       = '';
    this.winPayout     = 0;
  }

  // --- Player action ---

  private handleButtonTap() {
    if (this.roundManager.state === TapGameState.BETTING) {
      const joined = this.roundManager.playerJoinRound();
      if (joined) {
        this.cashoutButton.showBetPlaced();
        this.playersPanel.setPlayerBetting(PLAYER_ROW, true);
        this.potDisplay.setPot(this.roundManager.potValue);
        this.potDisplay.setTotalBet(this.roundManager.tableBet, false);
        this.potDisplay.flash();
        this.updateBalanceText();
      }
    } else if (this.roundManager.state === TapGameState.RUNNING) {
      if (this.roundManager.playerInRound) {
        const accepted = this.roundManager.registerPlayerTap();
        if (accepted) {
          this.potDisplay.setPot(this.roundManager.potValue);
          this.potDisplay.flash();
          this.updateBalanceText();
          this.chatPanel.addMessage('YOU', 'tapped!', 0x00ff88);
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

  // --- Layout ---

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
