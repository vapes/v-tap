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

`main.ts` bootstraps a Pixi Application, then `Game.ts` manages navigation through four scenes in order:

```
LobbyScene → RulesScene → TableSelectScene → GameScene
```

`Game.ts` is the sole orchestrator: it instantiates scenes, wires up callbacks between them, and handles resize events.

### Game Logic Layer (`src/logic/`)

**`RoundManager.ts`** — core state machine with states `WAITING | RUNNING | CRASHED | RESULT`
- Crash point drawn via inverse CDF: `P(crash > m) = (1 - houseEdge) / m`, giving 99% RTP
- Multiplier grows exponentially: `e^(elapsed × growthRate)` where `growthRate` is randomized each round from `[0.15, 0.275]`
- Tracks player balance, current bet, pot, cashout history

**`BotPlayers.ts`** — 20–50 bot agents (randomized per session), each with a named personality (`conservative`, `moderate`, `aggressive`, `degen`) that determines their cashout range. Bots have a 15% chance to go "greedy" and extend their target. Per-round participation is random (20–70% of bots bet each round).

### UI Layer (`src/ui/`)

Stateless Pixi `Container` subclasses updated by `GameScene` each frame:
- `MultiplierText` — live multiplier display
- `CashoutButton` — main player interaction; color shifts green→yellow→orange with multiplier
- `PlayersPanel` — scrollable player list with smooth Y-lerp row reordering; sorts by cashout multiplier during a round
- `PotDisplay` — pot total + crash history pills + cashout log
- `ChatPanel` — bot reaction messages

### Configuration

All gameplay math lives in **`src/math-config.json`** (imported as a module). Changing values here (house edge, growth rate, timing, bot personalities) affects everything without touching logic code.

### Key Design Patterns

- **No external state library** — `RoundManager` holds all mutable state; `GameScene` reads it each `ticker` tick.
- **No image assets** — all visuals are procedural Pixi Graphics primitives (circles, arcs, rectangles).
- **Frame-loop driven** — `GameScene.ts` registers a single Pixi `Ticker` callback that updates all UI components and advances game state every frame.
- **Pixi Graphics arc rule** — always call `moveTo(startX, startY)` before `arc()` to prevent Pixi from drawing an implicit connecting line from the previous path position. Forgetting this creates a visible seam/line on arc elements like the betting progress ring.
