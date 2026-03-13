#!/usr/bin/env node

/**
 * Simulates 2M rounds of the Last Tap crash game across a range of
 * fixed-cashout strategies and reports the one with the highest RTP.
 *
 * Accounts for:
 *  - Crash distribution: crashPoint = 0.99 / (1 − r), clamped [1, 50]
 *  - $1 pot contribution per bet (wager = tableBet − 1)
 *  - Pot accumulation & award to last cashout
 *  - Bot participants (20-50 bots, same distribution as game)
 */

const ROUNDS = 2_000_000;
const TABLE_BET = 10;
const POT_CONTRIBUTION = 1;
const HOUSE_EDGE = 0.01;
const MIN_MULT = 1.0;
const MAX_MULT = 50;

// ── Bot config (mirrors math-config.json) ──────────────────────────
const BOT_COUNT_MIN = 20;
const BOT_COUNT_MAX = 50;
const BOT_BET_CHANCE = 0.75;
const BOT_GREEDY_CHANCE = 0.15;
const BOT_GREEDY_MULT = 1.5;
const PERSONALITIES = [
  { name: 'conservative', cashoutMin: 1.2, cashoutMax: 2.5,  weight: 0.25 },
  { name: 'moderate',     cashoutMin: 1.5, cashoutMax: 5.0,  weight: 0.35 },
  { name: 'aggressive',   cashoutMin: 2.0, cashoutMax: 10.0, weight: 0.25 },
  { name: 'degen',        cashoutMin: 3.0, cashoutMax: 25.0, weight: 0.15 },
];

function generateCrashPoint() {
  const r = Math.random();
  const raw = (1 - HOUSE_EDGE) / (1 - r);
  return Math.min(Math.max(raw, MIN_MULT), MAX_MULT);
}

function pickPersonality() {
  const r = Math.random();
  let cum = 0;
  for (const p of PERSONALITIES) {
    cum += p.weight;
    if (r < cum) return p;
  }
  return PERSONALITIES[PERSONALITIES.length - 1];
}

function randomRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// ── Simulate with pot mechanics ────────────────────────────────────
function simulateWithPot(playerCashoutTarget, rounds) {
  let totalBet = 0;
  let totalReturn = 0;
  let potValue = 0;
  const botCount = Math.floor(randomRange(BOT_COUNT_MIN, BOT_COUNT_MAX + 1));

  for (let i = 0; i < rounds; i++) {
    const crash = generateCrashPoint();

    // Player always bets
    totalBet += TABLE_BET;
    const playerWager = TABLE_BET - POT_CONTRIBUTION;
    potValue += POT_CONTRIBUTION;

    // Bots that participate this round
    let botCashouts = [];
    for (let b = 0; b < botCount; b++) {
      if (Math.random() > BOT_BET_CHANCE) continue;
      potValue += POT_CONTRIBUTION;

      const pers = pickPersonality();
      let target = randomRange(pers.cashoutMin, pers.cashoutMax);
      if (Math.random() < BOT_GREEDY_CHANCE) target *= BOT_GREEDY_MULT;
      target = Math.min(target, MAX_MULT);

      if (crash > target) {
        botCashouts.push(target);
      }
    }

    let playerCashedOut = false;
    let playerPayout = 0;

    if (crash > playerCashoutTarget) {
      playerCashedOut = true;
      playerPayout = playerWager * playerCashoutTarget;
    }

    // Determine last cashout (highest multiplier among survivors) → wins pot
    let lastCashout = -1;
    let playerIsLast = false;

    for (const bc of botCashouts) {
      if (bc > lastCashout) lastCashout = bc;
    }
    if (playerCashedOut) {
      if (playerCashoutTarget >= lastCashout) {
        playerIsLast = true;
        lastCashout = playerCashoutTarget;
      }
    }

    if (playerIsLast) {
      totalReturn += playerPayout + potValue;
      potValue = 0;
    } else if (playerCashedOut) {
      totalReturn += playerPayout;
      if (lastCashout > 0) potValue = 0; // bot won pot
    } else {
      if (lastCashout > 0) potValue = 0; // bot won pot
    }
  }

  return totalReturn / totalBet;
}

// ── Pure crash RTP (no pot, simpler) ───────────────────────────────
function simulatePureCrash(playerCashoutTarget, rounds) {
  let totalBet = 0;
  let totalReturn = 0;

  for (let i = 0; i < rounds; i++) {
    const crash = generateCrashPoint();
    totalBet += TABLE_BET;
    const wager = TABLE_BET - POT_CONTRIBUTION;
    if (crash > playerCashoutTarget) {
      totalReturn += wager * playerCashoutTarget;
    }
  }

  return totalReturn / totalBet;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   Optimal Cashout Strategy — 2M Rounds Simulation      ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  Rounds: ${(ROUNDS / 1e6).toFixed(0)}M  |  Table bet: $${TABLE_BET}  |  Pot contrib: $${POT_CONTRIBUTION}`);
console.log(`  House edge: ${(HOUSE_EDGE * 100).toFixed(1)}%  |  Crash range: [${MIN_MULT}, ${MAX_MULT}]\n`);

const targets = [
  1.01, 1.05, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75,
  2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 49.0,
];

// ── Part 1: Pure crash RTP (wager return only, no pot) ─────────────
console.log('━━━ PART 1: Pure Crash RTP (без пота) ━━━');
console.log('  Effective wager RTP for any target ≈ 99% × (bet−1)/bet');
console.log(`  Theoretical: ${((1 - HOUSE_EDGE) * (TABLE_BET - POT_CONTRIBUTION) / TABLE_BET * 100).toFixed(2)}%\n`);
console.log('  Target      Win%       Simulated RTP');
console.log('  ──────────  ─────────  ─────────────');

let bestPure = { target: 0, rtp: 0 };
for (const t of targets) {
  const rtp = simulatePureCrash(t, ROUNDS);
  const winRate = ((1 - HOUSE_EDGE) / t);
  if (rtp > bestPure.rtp) bestPure = { target: t, rtp };
  console.log(`  ${t.toFixed(2).padStart(6)}x     ${(Math.min(winRate, 1) * 100).toFixed(2).padStart(6)}%    ${(rtp * 100).toFixed(3)}%`);
}
console.log(`\n  ► Best pure: ${bestPure.target}x → ${(bestPure.rtp * 100).toFixed(3)}% RTP\n`);

// ── Part 2: With pot mechanics ─────────────────────────────────────
console.log('━━━ PART 2: С учётом пота (pot award to last cashout) ━━━');
console.log('  Higher targets = more likely to be last cashout = win pot more\n');
console.log('  Target      Simulated RTP (with pot)');
console.log('  ──────────  ────────────────────────');

let bestPot = { target: 0, rtp: 0 };
for (const t of targets) {
  const rtp = simulateWithPot(t, ROUNDS);
  if (rtp > bestPot.rtp) bestPot = { target: t, rtp };
  console.log(`  ${t.toFixed(2).padStart(6)}x     ${(rtp * 100).toFixed(3)}%`);
}
console.log(`\n  ► Best with pot: ${bestPot.target}x → ${(bestPot.rtp * 100).toFixed(3)}% RTP`);

// ── Part 3: Fine-grained sweep around best ─────────────────────────
console.log('\n━━━ PART 3: Точный перебор вокруг лучшей стратегии ━━━\n');

const fineLo = Math.max(1.01, bestPot.target - 3);
const fineHi = Math.min(MAX_MULT - 1, bestPot.target + 3);
const fineStep = 0.25;
const fineTargets = [];
for (let t = fineLo; t <= fineHi; t += fineStep) {
  fineTargets.push(parseFloat(t.toFixed(2)));
}

console.log('  Target      RTP (with pot)');
console.log('  ──────────  ─────────────');

let bestFine = { target: 0, rtp: 0 };
for (const t of fineTargets) {
  const rtp = simulateWithPot(t, ROUNDS);
  if (rtp > bestFine.rtp) bestFine = { target: t, rtp };
  console.log(`  ${t.toFixed(2).padStart(6)}x     ${(rtp * 100).toFixed(3)}%`);
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  ИТОГ:`);
console.log(`    Без пота   — любой кэшаут даёт ≈ ${((1 - HOUSE_EDGE) * (TABLE_BET - POT_CONTRIBUTION) / TABLE_BET * 100).toFixed(2)}% RTP`);
console.log(`    С потом    — лучший кэшаут: ${bestFine.target}x → ${(bestFine.rtp * 100).toFixed(3)}% RTP`);
console.log('══════════════════════════════════════════════════════════');
