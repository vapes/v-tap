#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROUNDS = 5_000_000;

// ─── Current formula (from the game) ────────────────────────────────
function currentCrashPoint() {
  const r = Math.random();
  const raw = 1 / (1 - r);
  return Math.min(Math.max(raw, 1.1), 50);
}

// ─── New formula with house edge ────────────────────────────────────
function targetCrashPoint(houseEdge, minMult, maxMult) {
  const r = Math.random();
  const raw = (1 - houseEdge) / (1 - r);
  return Math.min(Math.max(raw, minMult), maxMult);
}

// ─── Simulate RTP for a fixed cashout strategy ──────────────────────
function simulateRTP(crashFn, cashoutMultiplier, rounds) {
  let totalBet = 0;
  let totalReturn = 0;

  for (let i = 0; i < rounds; i++) {
    const crash = crashFn();
    totalBet += 1;
    if (crash > cashoutMultiplier) {
      totalReturn += cashoutMultiplier;
    }
  }

  return totalReturn / totalBet;
}

// ─── Distribution stats ─────────────────────────────────────────────
function crashDistributionStats(crashFn, rounds) {
  let instantCrash = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const buckets = { '1.0-1.5': 0, '1.5-2.0': 0, '2.0-3.0': 0, '3.0-5.0': 0, '5.0-10.0': 0, '10.0-50.0': 0 };

  for (let i = 0; i < rounds; i++) {
    const c = crashFn();
    sum += c;
    if (c < min) min = c;
    if (c > max) max = c;
    if (c <= 1.01) instantCrash++;

    if (c < 1.5) buckets['1.0-1.5']++;
    else if (c < 2.0) buckets['1.5-2.0']++;
    else if (c < 3.0) buckets['2.0-3.0']++;
    else if (c < 5.0) buckets['3.0-5.0']++;
    else if (c < 10.0) buckets['5.0-10.0']++;
    else buckets['10.0-50.0']++;
  }

  return { mean: sum / rounds, min, max, instantCrash, buckets };
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║        RTP Calculator — Last Tap (Crash Game)       ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log(`\nSimulating ${(ROUNDS / 1e6).toFixed(0)}M rounds per test...\n`);

// ─── CURRENT GAME ───────────────────────────────────────────────────
console.log('━━━ CURRENT FORMULA: 1/(1−r), clamped [1.1, 50] ━━━');
console.log('    House edge: 0%  →  Theoretical RTP: 100.00%\n');

const cashouts = [1.5, 2.0, 3.0, 5.0, 10.0, 20.0];

console.log('  Cashout     Simulated RTP    Theoretical RTP');
console.log('  ─────────   ─────────────    ───────────────');
for (const m of cashouts) {
  const simRTP = simulateRTP(currentCrashPoint, m, ROUNDS);
  const theoRTP = Math.min(1.0, 1.0 / m) * m; // = 1.0 for m >= 1.1
  console.log(`  ${m.toFixed(1).padStart(5)}x      ${(simRTP * 100).toFixed(3)}%          ${(theoRTP * 100).toFixed(2)}%`);
}

const currentStats = crashDistributionStats(currentCrashPoint, ROUNDS);
console.log(`\n  Distribution: mean=${currentStats.mean.toFixed(3)}, min=${currentStats.min.toFixed(3)}, max=${currentStats.max.toFixed(3)}`);
console.log(`  Instant crash (≤1.01x): ${currentStats.instantCrash} (${(currentStats.instantCrash / ROUNDS * 100).toFixed(3)}%)`);

// ─── TARGET: 99% RTP ────────────────────────────────────────────────
const HOUSE_EDGE = 0.01;
const MIN_MULT = 1.0;
const MAX_MULT = 50;

console.log('\n━━━ TARGET FORMULA: 0.99/(1−r), clamped [1.0, 50] ━━━');
console.log(`    House edge: ${(HOUSE_EDGE * 100).toFixed(0)}%  →  Theoretical RTP: ${((1 - HOUSE_EDGE) * 100).toFixed(2)}%\n`);

const targetFn = () => targetCrashPoint(HOUSE_EDGE, MIN_MULT, MAX_MULT);

console.log('  Cashout     Simulated RTP    Theoretical RTP');
console.log('  ─────────   ─────────────    ───────────────');
for (const m of cashouts) {
  const simRTP = simulateRTP(targetFn, m, ROUNDS);
  const theoRTP = (1 - HOUSE_EDGE);
  console.log(`  ${m.toFixed(1).padStart(5)}x      ${(simRTP * 100).toFixed(3)}%          ${(theoRTP * 100).toFixed(2)}%`);
}

const targetStats = crashDistributionStats(targetFn, ROUNDS);
console.log(`\n  Distribution: mean=${targetStats.mean.toFixed(3)}, min=${targetStats.min.toFixed(3)}, max=${targetStats.max.toFixed(3)}`);
console.log(`  Instant crash (≤1.01x): ${targetStats.instantCrash} (${(targetStats.instantCrash / ROUNDS * 100).toFixed(3)}%)`);

console.log('\n  Crash distribution (target):');
for (const [range, count] of Object.entries(targetStats.buckets)) {
  const pct = (count / ROUNDS * 100).toFixed(2);
  const bar = '█'.repeat(Math.round(pct));
  console.log(`    ${range.padEnd(10)} ${pct.padStart(6)}% ${bar}`);
}

// ═════════════════════════════════════════════════════════════════════
//  Generate math-config.json
// ═════════════════════════════════════════════════════════════════════

const mathConfig = {
  meta: {
    version: '1.0.0',
    rtp: 0.99,
    houseEdge: 0.01,
    description: 'Crash game math model. crashPoint = (1 - houseEdge) / (1 - random), random ∈ [0,1)',
  },

  crash: {
    houseEdge: 0.01,
    minMultiplier: 1.0,
    maxMultiplier: 50,
  },

  growth: {
    rateMin: 0.15,
    rateMax: 0.275,
  },

  player: {
    startingBalance: 1000,
    tables: [5, 10, 20, 50],
    rebuyThreshold: 50,
    rebuyAmount: 1000,
  },

  pot: {
    min: 500,
    max: 5000,
  },

  timing: {
    resultDelaySec: 3,
    waitDelaySec: 2,
    crashDisplaySec: 1.5,
  },

  bots: {
    count: 6,
    greedyChance: 0.15,
    greedyMultiplier: 1.5,
    rebuyThreshold: 50,
    rebuyBalanceMin: 1000,
    rebuyBalanceMax: 3000,
    startingBalanceMin: 2000,
    startingBalanceMax: 10000,
    personalities: {
      conservative: { cashoutMin: 1.2, cashoutMax: 2.5, betFractionMin: 0.03, betFractionMax: 0.08 },
      moderate:     { cashoutMin: 1.5, cashoutMax: 5.0, betFractionMin: 0.05, betFractionMax: 0.12 },
      aggressive:   { cashoutMin: 2.0, cashoutMax: 10.0, betFractionMin: 0.08, betFractionMax: 0.20 },
      degen:        { cashoutMin: 3.0, cashoutMax: 25.0, betFractionMin: 0.15, betFractionMax: 0.40 },
    },
  },

  crashHistory: {
    maxEntries: 10,
  },
};

const outputPath = path.join(__dirname, '..', 'src', 'math-config.json');
fs.writeFileSync(outputPath, JSON.stringify(mathConfig, null, 2) + '\n');
console.log(`\n══════════════════════════════════════════════════════`);
console.log(`✓ Math config written to src/math-config.json`);
console.log(`══════════════════════════════════════════════════════`);
