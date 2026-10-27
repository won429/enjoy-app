import { stockInfluence, INFLUENCE_WEIGHTS } from './investment-vlog.js';
export const HOUR_MS = 3_600_000;
export const UPDATE_MS = HOUR_MS / 2;
export const DAY_MS = 24 * HOUR_MS;
export const SYMBOLS = ['enjoy', 'en-joy'];
export const hourAt = time => Math.floor(time / HOUR_MS) * HOUR_MS;
export const tickAt = time => Math.floor(time / UPDATE_MS) * UPDATE_MS;
export const dayAt = time => Math.floor((time + 9 * HOUR_MS) / DAY_MS) * DAY_MS - 9 * HOUR_MS;
export const STOCK_PRICE_MODEL = 'daily-index-vlog-random-v2';
export const QUOTE_COMPARISON = 'previous-close';

function integer(value, fallback, max) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new Error('Invalid market configuration');
  return parsed;
}
export const configuredMaxHourlyBps = (env = {}) => integer(env.MAX_HOURLY_BPS, 1000, 1000);
export function createMarket(env = {}, now = Date.now()) {
  const studio = integer(env.INITIAL_STOCK_POINTS, 100, 1_000_000_000);
  const index = integer(env.INITIAL_INDEX_POINTS, 100, 1_000_000_000);
  return {
    schema: 1, hour: tickAt(now), createdAt: tickAt(now), revision: 0, indexMode: 'manual',
    updateIntervalMs: UPDATE_MS, nextTickAt: tickAt(now) + UPDATE_MS,
    maxHourlyBps: configuredMaxHourlyBps(env), priceModel: STOCK_PRICE_MODEL, quoteComparison: QUOTE_COMPARISON,
    baseStudio: studio, baseIndex: index, stockRemainder: 0,
    quotes: SYMBOLS.map((id, i) => ({ id, price: i ? studio : index, previous: i ? studio : index }))
  };
}
export function migrateMarketInterval(state, now = Date.now()) {
  if (state.updateIntervalMs === UPDATE_MS && Number.isSafeInteger(state.nextTickAt)) return state;
  // Start at the next future boundary; never invent half-hour prices before deployment.
  return { ...state, updateIntervalMs: UPDATE_MS, nextTickAt: tickAt(Math.max(now, state.hour)) + UPDATE_MS,
    revision: state.revision + 1 };
}
export function advanceMarket(current, now, signalsForHour = () => ({}), maxSteps = 72,
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000) {
  let state = structuredClone(current);
  const frames = [];
  const target = tickAt(now);
  while ((state.nextTickAt ?? state.hour + UPDATE_MS) <= target && frames.length < maxSteps) {
    const index = state.quotes.find(quote => quote.id === 'enjoy');
    const nextHour = state.nextTickAt ?? state.hour + UPDATE_MS;
    // Reset before pricing 00:00 KST: yesterday's move must not leak into today's stock tick.
    const indexBaseline = dayAt(nextHour) !== dayAt(state.hour) ? index.price : index.previous;
    const sample = random();
    if (!(sample >= 0 && sample < 1)) throw new Error('Invalid random sample');
    const randomBps = Math.floor(sample * (2 * state.maxHourlyBps + 1)) - state.maxHourlyBps;
    const signal = stockInfluence({ ...signalsForHour(nextHour), indexPrice: index.price,
      indexBaseline, maxBps: state.maxHourlyBps, randomBps });
    const studio = state.quotes.find(quote => quote.id === 'en-joy');
    const lower = Math.max(1, Math.ceil(studio.price * (10_000 - state.maxHourlyBps) / 10_000));
    const upper = Math.min(1_000_000_000, Math.floor(studio.price * (10_000 + state.maxHourlyBps) / 10_000));
    const exactPrice = studio.price * (10_000 + signal.bps) / 10_000 + (state.stockRemainder || 0);
    const newStudio = Math.max(lower, Math.min(upper, Math.round(exactPrice)));
    state = {
      ...state, hour: nextHour, nextTickAt: nextHour + UPDATE_MS, revision: state.revision + 1,
      stockRemainder: Math.max(-0.499999999, Math.min(0.499999999, exactPrice - newStudio)),
      lastDrivers: { ...signal, hour: nextHour, indexBaseline, indexDay: dayAt(nextHour) },
      quotes: state.quotes.map(quote => quote.id === 'enjoy'
        ? { ...quote, previous: indexBaseline }
        : { ...quote, previous: dayAt(nextHour) !== dayAt(state.hour) ? quote.price : quote.previous, price: newStudio })
    };
    frames.push(state);
  }
  return { state, frames };
}
export function marketView(state, now = Date.now()) {
  return {
    schema: 1, updateIntervalMs: UPDATE_MS, serverTime: now, asOf: state.hour,
    nextUpdateAt: state.nextTickAt ?? state.hour + UPDATE_MS, stale: (state.nextTickAt ?? state.hour + UPDATE_MS) <= tickAt(now),
    tradingEnabled: false, revision: state.revision, indexMode: 'manual', indexUpdatedAt: state.indexUpdatedAt || null,
    stockInfluenceWeights: INFLUENCE_WEIGHTS, indexInfluencePeriod: 'kst-day', quoteComparison: QUOTE_COMPARISON,
    maxChangeBps: state.maxHourlyBps, maxHourlyBps: state.maxHourlyBps, priceModel: STOCK_PRICE_MODEL, randomRangeBps: state.maxHourlyBps,
    quotes: state.quotes.map(quote => ({
      id: quote.id, price: quote.price, previous: quote.previous,
      change: quote.price - quote.previous,
      percent: Number(((quote.price - quote.previous) / quote.previous * 100).toFixed(2))
    }))
  };
}
export function historyWindow(period, now) {
  const today = dayAt(now);
  if (period === 'day') return { resolution: 'hour', start: today, end: today + DAY_MS - UPDATE_MS, stride: UPDATE_MS, intraday: true };
  const ranges = {
    '1d': ['hour', 24, UPDATE_MS], '1w': ['hour', 24 * 7, 2 * HOUR_MS],
    '3m': ['day', 90, DAY_MS], '1y': ['day', 366, 4 * DAY_MS],
    '5y': ['day', 366 * 5, 20 * DAY_MS], all: ['day', 366 * 10, 30 * DAY_MS]
  };
  const range = ranges[period];
  if (!range) return null;
  return { resolution: range[0], start: today - range[1] * (range[0] === 'hour' ? HOUR_MS : DAY_MS), end: today - UPDATE_MS, stride: range[2], intraday: false };
}
export function closedOrderbook(quote, stats, now) {
  const level = price => ({ price, quantity: 0 });
  return {
    symbol: quote.id, price: quote.price, previous: quote.previous, tickSize: 1,
    indicative: true, tradingEnabled: false, serverTime: now,
    asks: Array.from({ length: 5 }, (_, i) => level(quote.price + 5 - i)),
    bids: Array.from({ length: Math.min(5, quote.price - 1) }, (_, i) => level(quote.price - i - 1)),
    totalAsk: 0, totalBid: 0, trades: [],
    stats: { ...stats, volume: 0, strength: null }
  };
}
