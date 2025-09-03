// constants.js
export const MARKET_CODES = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];

export const COIN_NAMES = {
  "KRW-BTC": "비트코인",
  "KRW-ETH": "이더리움",
  "KRW-XRP": "리플",
};

export const PRICE_STEPS = [
  { min: 100000000, step: 100000 },
  { min: 50000000, step: 50000 },
  { min: 10000000, step: 10000 },
  { min: 1000000, step: 1000 },
  { min: 100000, step: 100 },
  { min: 10000, step: 10 },
  { min: 1000, step: 5 },
  { min: 100, step: 1 },
  { min: 0, step: 0.1 },
];
