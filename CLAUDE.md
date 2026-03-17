# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Type-check and build to dist/
npm run preview   # Preview the production build
npm run rtp       # Run RTP probability calculator (scripts/rtp-calculator.js)
```

No test framework is configured — there are no tests.

## Architecture

**Last Tap** is a multiplier crash-game simulator built with Pixi.js (WebGL 2D renderer) and TypeScript.

### Scene Flow

`main.ts` bootstraps a Pixi Application, then `Game.ts` manages navigation:

```
LobbyScene → GameModeSelectScene → GameScene (crash mode)
                                 → TapGameScene (tap mode)
```

`Game.ts` is the sole orchestrator: it instantiates scenes, wires up callbacks between them, and handles resize events.

### Game Modes

There are two independent game modes, each with its own logic and scene:

**Crash mode** (`GameScene` + `RoundManager` + `BotPlayers`):
- Multiplier grows until a hidden crash point; players cash out before it crashes
- `RoundManager.ts` — state machine with states `WAITING | RUNNING | CRASHED | RESULT`
- Crash point via inverse CDF: `P(crash > m) = (1 - houseEdge) / m`, giving 99% RTP
- Multiplier grows exponentially: `e^(elapsed × growthRate)` where `growthRate` is randomized per round from `[0.15, 0.275]`
- `BotPlayers.ts` — 20–50 bots with personalities (`conservative`, `moderate`, `aggressive`, `degen`) that determine cashout range; 15% chance to go "greedy"; 20–70% participate per round

**Tap mode** (`TapGameScene` + `TapRoundManager` + `TapBotPlayers`):
- A hidden timer runs; whoever taps last before time expires wins the pot
- `TapRoundManager.ts` — state machine with states `BETTING | RUNNING | ENDED | RESULT`
- Timer duration drawn from same inverse-CDF shape: `P(t > x) = timerMin / x`, clamped to `[timerMin, timerMax]`
- First tap per participant is free; subsequent taps cost `tableBet` and are added to the pot (up to `maxTaps`)
- Winner receives `pot × (1 - casinoCut)`; `lastTapper` at round end wins

### UI Layer (`src/ui/`)

Stateless Pixi `Container` subclasses updated by `GameScene` each frame:
- `MultiplierText` — live multiplier display
- `CashoutButton` — main player interaction; color shifts green→yellow→orange with multiplier
- `PlayersPanel` — scrollable player list with smooth Y-lerp row reordering; sorts by cashout multiplier during a round
- `PotDisplay` — pot total + crash history pills + cashout log
- `ChatPanel` — bot reaction messages
- `HeaderBar` — top bar (balance display, leave-table button)

### Configuration

All gameplay math lives in **`src/math-config.json`** (imported as a module). Changing values here (house edge, growth rate, timing, bot personalities) affects everything without touching logic code.

### Key Design Patterns

- **No external state library** — `RoundManager` holds all mutable state; `GameScene` reads it each `ticker` tick.
- **No image assets** — all visuals are procedural Pixi Graphics primitives (circles, arcs, rectangles).
- **Frame-loop driven** — `GameScene.ts` registers a single Pixi `Ticker` callback that updates all UI components and advances game state every frame.
- **Pixi Graphics arc rule** — always call `moveTo(startX, startY)` before `arc()` to prevent Pixi from drawing an implicit connecting line from the previous path position. Forgetting this creates a visible seam/line on arc elements like the betting progress ring.
