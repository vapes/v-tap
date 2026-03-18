import type { ClientMessage, ServerMessage } from '../../shared/protocol';

type Handler = (msg: ServerMessage) => void;

export class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private pendingQueue: ClientMessage[] = [];

  playerId = '';
  nickname = '';
  balance = 0;
  connected = false;

  connect(onOpen?: () => void) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      for (const msg of this.pendingQueue) this.send(msg);
      this.pendingQueue = [];
      onOpen?.();
    };

    this.ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.dispatch(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit('disconnected', { type: 'error', message: 'disconnected' } as ServerMessage);
    };
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingQueue.push(msg);
    }
  }

  on(type: string, handler: Handler) {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  off(type: string, handler: Handler) {
    const list = this.handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  private dispatch(msg: ServerMessage) {
    if (msg.type === 'welcome') {
      this.playerId = msg.playerId;
      this.nickname = msg.nickname;
      this.balance = msg.balance;
    }
    if (msg.type === 'balanceUpdate') {
      this.balance = msg.balance;
    }
    this.emit(msg.type, msg);
  }

  private emit(type: string, msg: ServerMessage) {
    const list = this.handlers.get(type);
    if (list) for (const h of list) h(msg);
  }
}
