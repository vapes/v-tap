export const config = {
  crash: {
    houseEdge: 0.01,
    minMultiplier: 1,
    maxMultiplier: 50,
    fixedBet: 10,
    potContribution: 1,
  },
  growth: {
    rateMin: 0.15,
    rateMax: 0.275,
  },
  player: {
    startingBalance: 1000,
    rebuyThreshold: 50,
    rebuyAmount: 1000,
  },
  timing: {
    bettingDelaySec: 10,
    resultDelaySec: 3,
    crashDisplaySec: 1.5,
  },
  tap: {
    fixedBet: 10,
    casinoCut: 0.01,
    maxTaps: 5,
    timerMin: 5,
    timerMax: 30,
    bettingDelaySec: 8,
    resultDelaySec: 3,
    endedDisplaySec: 2,
  },
  history: {
    maxEntries: 10,
  },
};
