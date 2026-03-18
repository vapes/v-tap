import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager';
import { Player } from './Player';
import { config } from './config';
import type { ClientMessage } from '../../shared/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../dist');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.static(CLIENT_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

const roomManager = new RoomManager();
const connectedPlayers = new Map<string, Player>();
let nextId = 1;

function generateId(): string {
  return String(nextId++).padStart(6, '0');
}

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket) => {
  const playerId = generateId();
  const player = new Player(playerId, ws, config.player.startingBalance);
  connectedPlayers.set(playerId, player);

  console.log(`[connect] ${playerId}`);

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    handleMessage(player, msg);
  });

  ws.on('close', () => {
    console.log(`[disconnect] ${playerId} (${player.nickname})`);
    roomManager.leaveCurrentRoom(player);
    connectedPlayers.delete(playerId);
  });
});

function handleMessage(player: Player, msg: ClientMessage) {
  switch (msg.type) {
    case 'setNickname': {
      const nick = msg.nickname.trim().slice(0, 16) || player.nickname;
      player.nickname = nick;
      player.send({ type: 'welcome', playerId: player.id, nickname: nick, balance: player.balance });
      break;
    }
    case 'joinRoom':
      roomManager.joinRoom(player, msg.mode);
      break;
    case 'leaveRoom':
      roomManager.leaveCurrentRoom(player);
      break;
    case 'placeBet':
      if (!roomManager.placeBet(player)) {
        player.send({ type: 'error', message: 'Cannot place bet' });
      }
      break;
    case 'cashout':
      if (!roomManager.cashout(player)) {
        player.send({ type: 'error', message: 'Cannot cash out' });
      }
      break;
    case 'tap':
      if (!roomManager.tap(player)) {
        player.send({ type: 'error', message: 'Cannot tap' });
      }
      break;
  }
}

const PORT = parseInt(process.env.PORT || '8080', 10);
server.listen(PORT, () => {
  console.log(`Last Tap server listening on :${PORT}`);
});
