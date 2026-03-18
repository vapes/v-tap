# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server at http://localhost:3000 (proxies /ws to server)
npm run dev:server   # Start WebSocket server at :8080 (run alongside dev)
npm run build        # Type-check client and build to dist/
npm run build:server # Bundle server with esbuild to server/dist/
npm run build:all    # Build both client and server
npm run start        # Run production server (serves client + WebSocket)
npm run rtp          # Run RTP probability calculator (scripts/rtp-calculator.js)
```

No test framework is configured — there are no tests.

### Development

Run two terminals:
1. `npm run dev:server` — starts the authoritative game server on port 8080
2. `npm run dev` — starts Vite on port 3000 with HMR; proxies `/ws` to the server

### Deployment (Fly.io)

- `Dockerfile` builds both client and server into a single image
- `fly.toml` configures the Fly.io machine (region `waw`, auto-stop)
- `.github/workflows/deploy.yml` deploys on push to `main` via `flyctl deploy`
- Requires `FLY_API_TOKEN` secret in GitHub repo settings

## Architecture

**Last Tap** is a real-time multiplayer crash/tap game. The server is authoritative; clients render state received over WebSocket.

### Project Structure

```
v-tap/
├── shared/            # Shared TypeScript types (imported by both client and server)
│   └── protocol.ts    # ClientMessage / ServerMessage discriminated unions, PlayerInfo
├── server/            # Node.js authoritative game server
│   └── src/
│       ├── index.ts       # Express (static files) + WebSocket upgrade on /ws
│       ├── RoomManager.ts # Routes players to CrashRoom or TapRoom
│       ├── CrashRoom.ts   # Server-side crash game state machine
│       ├── TapRoom.ts     # Server-side tap game state machine
│       ├── Player.ts      # Player state (id, nickname, balance, ws)
│       └── config.ts      # Game parameters (house edge, timing, etc.)
├── src/               # Pixi.js client
│   ├── main.ts        # Bootstraps Pixi Application + Game
│   ├── Game.ts        # Scene orchestrator, owns SocketClient
│   ├── network/
│   │   └── SocketClient.ts  # WebSocket client, event emitter for server messages
│   ├── scenes/
│   │   ├── LobbyScene.ts          # Nickname input + connect
│   │   ├── GameModeSelectScene.ts  # Choose crash or tap
│   │   ├── GameScene.ts           # Crash mode (server-driven)
│   │   └── TapGameScene.ts        # Tap mode (server-driven)
│   └── ui/            # Stateless Pixi display components
├── Dockerfile         # Multi-stage: build client+server, slim runtime
├── fly.toml           # Fly.io configuration
└── .github/workflows/deploy.yml
```

### Scene Flow

```
LobbyScene (nickname) → WebSocket connect → setNickname → welcome
  → GameModeSelectScene → joinRoom("crash") → GameScene
                        → joinRoom("tap")   → TapGameScene
```

### Server-Client Protocol

All messages are JSON over WebSocket (`/ws` endpoint).

**Client → Server:** `setNickname`, `joinRoom`, `leaveRoom`, `placeBet`, `cashout`, `tap`

**Server → Client:** `welcome`, `roomState` (full snapshot on join), `phaseChange`, `betPlaced`, `playerCashedOut`, `playerTapped`, `tick` (20Hz state sync), `roundResult`, `balanceUpdate`, `playerJoined`, `playerLeft`, `error`

Types defined in `shared/protocol.ts`.

### Game Modes

**Crash mode** (`CrashRoom` on server, `GameScene` on client):
- Server generates crash point via inverse CDF: `(1 - houseEdge) / (1 - r)`
- Server ticks at 20Hz, broadcasts multiplier `e^(elapsed × growthRate)`
- Client interpolates between ticks using known `growthRate` for 60fps display
- Players cash out by sending `cashout`; server validates and broadcasts
- Last cashout wins the pot; solo rounds (1 player) skip pot mechanics

**Tap mode** (`TapRoom` on server, `TapGameScene` on client):
- Server generates hidden duration via inverse CDF: `timerMin / (1 - r)`
- Players tap by sending `tap`; first tap free, subsequent cost `fixedBet`
- Last tapper when time expires wins `pot × (1 - casinoCut)`

### State Machine Phases

- **Crash:** `BETTING → RUNNING → CRASHED → RESULT → BETTING`
- **Tap:** `BETTING → RUNNING → ENDED → RESULT → BETTING`

Server uses `Date.now()` for accurate timing; `setInterval` at 50ms for the game loop tick.

### UI Layer (`src/ui/`)

Stateless Pixi `Container` subclasses updated by scenes each frame:
- `MultiplierText` — live multiplier or elapsed time display
- `CashoutButton` — main player interaction; color shifts with multiplier/time
- `PlayersPanel` — scrollable player list with smooth Y-lerp row reordering
- `PotDisplay` — pot total + flash animation
- `HeaderBar` — top bar with back button + round history pills

### Key Design Patterns

- **Server-authoritative** — all game state (crash point, balances, pot, winner) computed on server; clients are renderers.
- **No image assets** — all visuals are procedural Pixi Graphics primitives.
- **Frame-loop driven** — scenes register Pixi `Ticker` callbacks that read server state and update UI.
- **Client interpolation** — crash multiplier is extrapolated locally between server ticks for smooth 60fps.
- **Event-driven networking** — `SocketClient` uses an event emitter pattern; scenes subscribe to specific message types.
- **Pixi Graphics arc rule** — always call `moveTo(startX, startY)` before `arc()` to prevent Pixi from drawing an implicit connecting line.
