export type GameMode = 'crash' | 'tap';

export interface PlayerInfo {
  id: string;
  nickname: string;
  inRound: boolean;
  cashedOut?: boolean;
  cashoutMultiplier?: number;
  cashoutAmount?: number;
  tapCount?: number;
  lastTapTime?: number;
}

// ── Client → Server ──

export type ClientMessage =
  | { type: 'setNickname'; nickname: string }
  | { type: 'joinRoom'; mode: GameMode }
  | { type: 'leaveRoom' }
  | { type: 'placeBet' }
  | { type: 'cashout' }
  | { type: 'tap' };

// ── Server → Client ──

export type ServerMessage =
  | WelcomeMsg
  | ErrorMsg
  | RoomStateMsg
  | PhaseChangeMsg
  | PlayerJoinedMsg
  | PlayerLeftMsg
  | BetPlacedMsg
  | PlayerCashedOutMsg
  | PlayerTappedMsg
  | TickMsg
  | RoundResultMsg
  | BalanceUpdateMsg;

export interface WelcomeMsg {
  type: 'welcome';
  playerId: string;
  nickname: string;
  balance: number;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

export interface RoomStateMsg {
  type: 'roomState';
  mode: GameMode;
  phase: string;
  players: PlayerInfo[];
  pot: number;
  roundNumber: number;
  history: number[];
  bettingTimeLeft?: number;
  multiplier?: number;
  growthRate?: number;
  elapsed?: number;
  lastTapperId?: string | null;
  lastTapperName?: string | null;
}

export interface PhaseChangeMsg {
  type: 'phaseChange';
  phase: string;
  bettingTimeLeft?: number;
  growthRate?: number;
  crashPoint?: number;
  duration?: number;
}

export interface PlayerJoinedMsg {
  type: 'playerJoined';
  player: PlayerInfo;
}

export interface PlayerLeftMsg {
  type: 'playerLeft';
  playerId: string;
}

export interface BetPlacedMsg {
  type: 'betPlaced';
  playerId: string;
  nickname: string;
  pot: number;
}

export interface PlayerCashedOutMsg {
  type: 'playerCashedOut';
  playerId: string;
  nickname: string;
  multiplier: number;
  cashoutAmount: number;
}

export interface PlayerTappedMsg {
  type: 'playerTapped';
  playerId: string;
  nickname: string;
  tapTime: number;
  tapCount: number;
  pot: number;
}

export interface TickMsg {
  type: 'tick';
  elapsed: number;
  multiplier?: number;
  pot: number;
}

export interface RoundResultMsg {
  type: 'roundResult';
  winnerId: string | null;
  winnerName: string | null;
  winnerCashoutAmount: number;
  potWon: number;
  crashPoint?: number;
  duration?: number;
}

export interface BalanceUpdateMsg {
  type: 'balanceUpdate';
  balance: number;
}
