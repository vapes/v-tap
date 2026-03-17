import { Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js';
import { AnimalType } from '../logic/BotPlayers';

export interface PlayerRowData {
  name:      string;
  animalType: AnimalType;
  neonColor: number;
  bet:       number;
  balance:   number;
  isPlayer:  boolean;
  status:    null | number | 'busted' | 'out';
  inRound:   boolean;
  tapCount?: number;
}

const ROW_H = 28;
const PAD_X = 6;

interface RowView {
  container:  Container;
  bg:         Graphics;
  nameText:   Text;
  statusText: Text;
}

export class PlayersPanel extends Container {
  private scrollContent:  Container;
  private clipMask:       Graphics;
  private divider:        Graphics;
  private rows:           RowView[]                           = [];
  private neonColors:     number[]                            = [];
  private inRound:        boolean[]                           = [];
  private rowVisible:     boolean[]                           = [];
  private statusValues:   Array<null | number | 'busted' | 'out'> = [];
  private isPlayerRow:    boolean[]                           = [];
  private targetY:        number[]                            = [];
  private lastTapTimes:   number[]                            = [];
  private colWidth  = 0;
  private colHeight = 0;
  private scrollY   = 0;

  private dragActive      = false;
  private dragStartY      = 0;
  private dragStartScroll = 0;
  private readonly onWindowMove: (e: PointerEvent) => void;
  private readonly onWindowUp:   () => void;

  constructor() {
    super();

    this.scrollContent = new Container();
    this.addChild(this.scrollContent);

    this.clipMask = new Graphics();
    this.addChild(this.clipMask);
    this.scrollContent.mask = this.clipMask;

    this.divider = new Graphics();
    this.addChild(this.divider);

    this.onWindowMove = (e: PointerEvent) => {
      if (!this.dragActive) return;
      const dy = this.dragStartY - e.clientY;
      this.setScroll(this.dragStartScroll + dy);
    };
    this.onWindowUp = () => {
      this.dragActive = false;
      window.removeEventListener('pointermove', this.onWindowMove);
      window.removeEventListener('pointerup',   this.onWindowUp);
    };

    this.eventMode = 'static';
    this.on('pointerdown', (e) => {
      this.dragActive      = true;
      this.dragStartY      = e.global.y;
      this.dragStartScroll = this.scrollY;
      window.addEventListener('pointermove', this.onWindowMove);
      window.addEventListener('pointerup',   this.onWindowUp);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.on('wheel', (e: any) => {
      this.setScroll(this.scrollY + e.deltaY * 0.5);
    });
  }

  private visibleRowCount(): number {
    let count = 0;
    for (let i = 0; i < this.rowVisible.length; i++) {
      if (this.rowVisible[i]) count++;
    }
    return count;
  }

  private maxScrollY(): number {
    return Math.max(0, this.visibleRowCount() * ROW_H - this.colHeight);
  }

  private setScroll(y: number) {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY(), y));
    this.scrollContent.y = -this.scrollY;
  }

  setPlayers(players: PlayerRowData[]) {
    for (const row of this.rows) {
      this.scrollContent.removeChild(row.container);
    }
    this.rows         = [];
    this.neonColors   = [];
    this.inRound      = [];
    this.rowVisible   = [];
    this.statusValues = [];
    this.isPlayerRow  = [];
    this.targetY      = [];
    this.lastTapTimes = [];

    for (let i = 0; i < players.length; i++) {
      const p    = players[i];
      const isMe = p.isPlayer;

      const rowContainer = new Container();
      rowContainer.y = i * ROW_H;

      const bg = new Graphics();
      if (isMe) {
        bg.beginFill(0x001a0d, 0.5);
        bg.drawRect(0, 0, 9999, ROW_H);
        bg.endFill();
      }
      rowContainer.addChild(bg);

      const nameText = new Text(isMe ? 'YOU' : p.name, new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize:   isMe ? 20 : 18,
        fontWeight: isMe ? 'bold' : 'normal',
        fill:       isMe ? 0x00ff88 : 0x666666,
      }));
      nameText.x = PAD_X;
      nameText.y = (ROW_H - nameText.height) / 2;
      rowContainer.addChild(nameText);

      const statusText = new Text('', new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize:   18,
        fontWeight: 'bold',
        fill:       isMe ? 0x00ff88 : 0x666666,
        align:      'right',
      }));
      statusText.anchor.set(1, 0);
      statusText.y = (ROW_H - statusText.height) / 2;
      rowContainer.addChild(statusText);

      this.scrollContent.addChild(rowContainer);
      this.rows.push({ container: rowContainer, bg, nameText, statusText });
      this.neonColors.push(p.neonColor);
      this.inRound.push(false);
      this.rowVisible.push(true);
      this.statusValues.push(null);
      this.isPlayerRow.push(isMe);
      this.targetY.push(i * ROW_H);
      this.lastTapTimes.push(-1);
    }

  }

  setPlayerBetting(index: number, betting: boolean) {
    if (index < 0 || index >= this.rows.length) return;
    this.inRound[index] = betting;
    this.rows[index].statusText.text = betting ? 'BET' : '';
  }

  showOnlyBettingPlayers() {
    let pos = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.inRound[i]) {
        this.rowVisible[i] = true;
        this.rows[i].container.visible = true;
        this.targetY[i] = pos * ROW_H;
        this.rows[i].container.y = pos * ROW_H;
        pos++;
      } else {
        this.rowVisible[i] = false;
        this.rows[i].container.visible = false;
      }
    }
    this.setScroll(0);
  }

  resetForBetting() {
    for (let i = 0; i < this.rows.length; i++) {
      this.rowVisible[i]           = true;
      this.rows[i].container.visible = true;
      this.inRound[i]              = false;
      this.statusValues[i]         = null;
      this.lastTapTimes[i]         = -1;
      this.rows[i].statusText.text = '';
      const defaultColor = this.isPlayerRow[i] ? 0x00ff88 : 0x666666;
      this.rows[i].nameText.style.fill   = defaultColor;
      this.rows[i].statusText.style.fill = defaultColor;
    }
    this.restoreOrder();
  }

  updatePlayerStatus(index: number, status: null | number | 'busted' | 'out') {
    if (index < 0 || index >= this.rows.length) return;
    this.statusValues[index] = status;
    const row = this.rows[index];
    if (typeof status === 'number') {
      const color = this.isPlayerRow[index] ? 0xffe566 : 0x00ff88;
      row.nameText.style.fill   = color;
      row.statusText.style.fill = color;
      row.statusText.text = `${status.toFixed(2)}×`;
    } else if (status === 'busted') {
      row.nameText.style.fill   = 0xff3333;
      row.statusText.style.fill = 0xff3333;
      row.statusText.text = 'BUST';
    } else if (status === null && this.inRound[index]) {
      // In round, currently running — keep the same look as during betting phase
      const color = this.isPlayerRow[index] ? 0x00ff88 : 0x666666;
      row.nameText.style.fill   = color;
      row.statusText.style.fill = color;
      row.statusText.text = 'BET';
    } else {
      row.nameText.style.fill   = this.isPlayerRow[index] ? 0x00ff88 : 0x666666;
      row.statusText.style.fill = this.isPlayerRow[index] ? 0x00ff88 : 0x666666;
      row.statusText.text = '';
    }
  }

  /** Call every frame during RUNNING to keep rows sorted by tap (cashout) first. */
  sortForRound(currentMultiplier: number) {
    const keys: { index: number; key: number }[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      if (!this.rowVisible[i]) continue;
      const s = this.statusValues[i];
      let key: number;
      if (typeof s === 'number') {
        key = s + 1000;
      } else if (s === null && this.inRound[i]) {
        key = currentMultiplier;
      } else if (s === 'busted') {
        key = -1;
      } else {
        key = -2;
      }
      keys.push({ index: i, key });
    }

    keys.sort((a, b) => b.key - a.key || a.index - b.index);

    for (let pos = 0; pos < keys.length; pos++) {
      this.targetY[keys[pos].index] = pos * ROW_H;
    }
  }

  layout(colWidth: number, screenHeight: number) {
    this.colWidth  = colWidth;
    this.colHeight = screenHeight;
    this.hitArea   = new Rectangle(0, 0, colWidth, screenHeight);

    this.clipMask.clear();
    this.clipMask.beginFill(0xffffff);
    this.clipMask.drawRect(0, 0, colWidth, screenHeight);
    this.clipMask.endFill();

    this.divider.clear();

    // Redraw player bg to correct width
    for (let i = 0; i < this.rows.length; i++) {
      if (this.isPlayerRow[i]) {
        this.rows[i].bg.clear();
        this.rows[i].bg.beginFill(0x001a0d, 0.5);
        this.rows[i].bg.drawRect(0, 0, colWidth, ROW_H);
        this.rows[i].bg.endFill();
      }
    }

    this.repositionStatusX();
  }

  height_px(): number {
    return this.rows.length * ROW_H;
  }

  /** Screen-space center of a player row (accounts for scroll and current Y). */
  getRowScreenCenter(index: number): { x: number; y: number } {
    const currentY = index < this.rows.length ? this.rows[index].container.y : index * ROW_H;
    const rawY = this.y + (currentY + ROW_H / 2) - this.scrollY;
    return {
      x: this.x + this.colWidth / 2,
      y: Math.max(this.y + ROW_H / 2, Math.min(this.y + this.colHeight - ROW_H / 2, rawY)),
    };
  }

  animate(dt: number) {
    const speed = dt * 8; // rows per second
    for (let i = 0; i < this.rows.length; i++) {
      const cur = this.rows[i].container.y;
      const tgt = this.targetY[i];
      if (Math.abs(cur - tgt) < 0.5) {
        this.rows[i].container.y = tgt;
      } else {
        this.rows[i].container.y += (tgt - cur) * Math.min(speed, 1);
      }
    }
  }

  private repositionStatusX() {
    const w = this.colWidth || 100;
    for (const row of this.rows) {
      row.statusText.x = w - PAD_X;
    }
  }

  updateTapStatus(index: number, tapCount: number, isLastTapper: boolean, lastTapTime: number) {
    if (index < 0 || index >= this.rows.length) return;
    this.lastTapTimes[index] = lastTapTime;
    const row = this.rows[index];
    if (tapCount > 0 && lastTapTime >= 0) {
      row.statusText.text = `${lastTapTime.toFixed(1)}s`;
      if (isLastTapper) {
        const color = this.isPlayerRow[index] ? 0xffaa00 : 0xff8800;
        row.nameText.style.fill   = color;
        row.statusText.style.fill = color;
      } else {
        const color = this.isPlayerRow[index] ? 0x00ff88 : 0x888888;
        row.nameText.style.fill   = color;
        row.statusText.style.fill = color;
      }
    } else if (this.inRound[index]) {
      row.statusText.text = 'BET';
      const color = this.isPlayerRow[index] ? 0x00ff88 : 0x666666;
      row.nameText.style.fill   = color;
      row.statusText.style.fill = color;
    }
  }

  /** Sort by last tap time descending: most recent tapper at top (they're winning). */
  sortForTapRound() {
    const keys: { index: number; key: number }[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      if (!this.rowVisible[i]) continue;
      const tapTime = this.lastTapTimes[i];
      let key: number;
      if (tapTime >= 0) {
        key = tapTime + 1000;
      } else if (this.inRound[i]) {
        key = 0;
      } else {
        key = -1;
      }
      keys.push({ index: i, key });
    }

    keys.sort((a, b) => b.key - a.key || a.index - b.index);

    for (let pos = 0; pos < keys.length; pos++) {
      this.targetY[keys[pos].index] = pos * ROW_H;
    }
  }

  private restoreOrder() {
    for (let i = 0; i < this.rows.length; i++) {
      this.targetY[i] = i * ROW_H;
      this.rows[i].container.y = i * ROW_H;
    }
    this.setScroll(0);
  }

}
