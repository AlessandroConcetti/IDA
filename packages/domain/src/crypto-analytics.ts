/**
 * IDA Crypto analytics: deterministic, read-only, spot-only research primitives.
 * Never execute trades or imply that a stop order guarantees a maximum loss.
 * Inputs must be timestamped/validated by the data ingestion layer.
 */
export interface Level { readonly price: number; readonly quantity: number }
export interface Trade { readonly price: number; readonly quantity: number }
export interface Candle { readonly high: number; readonly low: number; readonly close: number }
export interface RiskReport { readonly varAmount: number; readonly expectedShortfall: number; readonly tailObservations: number; readonly observations: number; readonly confidence: number }

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}
function positive(value: number, name: string): void {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be > 0`);
}
function fraction(value: number, name: string): void {
  finite(value, name);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be within [0,1]`);
}
function last(values: readonly number[]): number {
  const value = values[values.length - 1];
  if (value === undefined) throw new RangeError("empty series");
  return value;
}

export function bidAskSpread(bid: number, ask: number) {
  positive(bid, "bid"); positive(ask, "ask");
  if (ask < bid) throw new RangeError("crossed quote");
  const mid = (bid + ask) / 2;
  return { absolute: ask - bid, mid, basisPoints: ((ask - bid) / mid) * 10000 };
}

/** One instantaneous CLOB snapshot, without price moves, commissions or queue priority. */
export function previewMarketSweep(side: "BUY" | "SELL", quantity: number, levels: readonly Level[]) {
  positive(quantity, "quantity");
  if (!levels.length) throw new RangeError("empty order book");
  levels.forEach((level) => { positive(level.price, "level price"); positive(level.quantity, "level quantity"); });
  const sorted = [...levels].sort((a, b) => side === "BUY" ? a.price - b.price : b.price - a.price);
  const reference = sorted[0];
  if (!reference) throw new RangeError("empty order book");
  let remaining = quantity;
  let notional = 0;
  for (const level of sorted) {
    const used = Math.min(remaining, level.quantity);
    notional += used * level.price;
    remaining -= used;
    if (remaining <= quantity * 1e-12) break;
  }
  if (remaining > quantity * 1e-12) return { status: "INSUFFICIENT_DEPTH" as const, filledQuantity: quantity - remaining };
  const vwap = notional / quantity;
  const bps = (side === "BUY" ? vwap / reference.price - 1 : 1 - vwap / reference.price) * 10000;
  return { status: "FILLED_IN_SIMULATION" as const, vwap, notional, slippageBasisPoints: bps, filledQuantity: quantity };
}

export function tradeVWAP(trades: readonly Trade[]) {
  if (!trades.length) throw new RangeError("no trades");
  let notional = 0, volume = 0;
  for (const trade of trades) {
    positive(trade.price, "trade price"); positive(trade.quantity, "trade quantity");
    volume += trade.quantity; notional += trade.price * trade.quantity;
  }
  return notional / volume;
}

export function sma(values: readonly number[], period: number) {
  if (!Number.isInteger(period) || period < 2 || values.length < period) throw new RangeError("insufficient SMA history");
  values.forEach((v) => finite(v, "price"));
  return values.slice(-period).reduce((sum, v) => sum + v, 0) / period;
}

function emaSeries(values: readonly number[], period: number): readonly (number | null)[] {
  if (!Number.isInteger(period) || period < 2 || values.length < period) throw new RangeError("insufficient EMA history");
  values.forEach((v) => finite(v, "price"));
  const output: (number | null)[] = Array(values.length).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  output[period - 1] = ema;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = alpha * (values[i] ?? 0) + (1 - alpha) * ema;
    output[i] = ema;
  }
  return output;
}

/** Wilder RSI, not a prediction. 0/0 flat period yields neutral 50. */
export function rsiWilder(closes: readonly number[], period = 14) {
  if (!Number.isInteger(period) || period < 2 || closes.length < period + 1) throw new RangeError("insufficient RSI history");
  closes.forEach((v) => positive(v, "close"));
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    gain += Math.max(0, delta); loss += Math.max(0, -delta);
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    gain = (gain * (period - 1) + Math.max(0, delta)) / period;
    loss = (loss * (period - 1) + Math.max(0, -delta)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Standard MACD(12,26,9), signal seeded after enough MACD observations. */
export function macd(closes: readonly number[], fast = 12, slow = 26, signal = 9) {
  if (!Number.isInteger(fast) || !Number.isInteger(slow) || !Number.isInteger(signal) || fast < 2 || slow <= fast || signal < 2 || closes.length < slow + signal - 1) {
    throw new RangeError("insufficient MACD history or invalid periods");
  }
  const eFast = emaSeries(closes, fast), eSlow = emaSeries(closes, slow);
  const macds: number[] = [];
  for (let i = slow - 1; i < closes.length; i++) {
    macds.push((eFast[i] ?? 0) - (eSlow[i] ?? 0));
  }
  const macdLine = last(macds);
  const signalLine = last(emaSeries(macds, signal).filter((x): x is number => x !== null));
  return { macd: macdLine, signal: signalLine, histogram: macdLine - signalLine };
}

export function bollinger(closes: readonly number[], period = 20, deviations = 2) {
  positive(deviations, "deviations");
  const mean = sma(closes, period);
  const window = closes.slice(-period);
  const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  return { middle: mean, upper: mean + deviations * sd, lower: mean - deviations * sd, standardDeviation: sd };
}

export function atrWilder(bars: readonly Candle[], period = 14) {
  if (!Number.isInteger(period) || period < 2 || bars.length < period + 1) throw new RangeError("insufficient ATR history");
  bars.forEach((bar) => {
    positive(bar.high, "high"); positive(bar.low, "low"); positive(bar.close, "close");
    if (bar.high < bar.low || bar.close > bar.high || bar.close < bar.low) throw new RangeError("invalid candle");
  });
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const current = bars[i], prev = bars[i - 1];
    if (!current || !prev) throw new RangeError("missing bar");
    ranges.push(Math.max(current.high - current.low, Math.abs(current.high - prev.close), Math.abs(current.low - prev.close)));
  }
  let atr = ranges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (const range of ranges.slice(period)) atr = (atr * (period - 1) + range) / period;
  return atr;
}

export function fibonacciRetracements(low: number, high: number) {
  positive(low, "low"); positive(high, "high");
  if (high <= low) throw new RangeError("high must exceed low");
  const range = high - low;
  return { "23.6": high - .236 * range, "38.2": high - .382 * range, "50": high - .5 * range, "61.8": high - .618 * range };
}

/** Educational spot-only risk model. A stop trigger is NOT a loss guarantee. */
export function spotPositionSizing(input: { equity: number; entry: number; stop: number; riskFraction: number; estimatedRoundTripCostBps: number; cashAvailable: number }) {
  const { equity, entry, stop, riskFraction, estimatedRoundTripCostBps, cashAvailable } = input;
  positive(equity, "equity"); positive(entry, "entry"); positive(stop, "stop");
  if (stop >= entry) throw new RangeError("long spot stop must be below entry");
  fraction(riskFraction, "risk fraction");
  finite(estimatedRoundTripCostBps, "cost bps"); if (estimatedRoundTripCostBps < 0) throw new RangeError("negative cost");
  finite(cashAvailable, "cash"); if (cashAvailable < 0) throw new RangeError("negative cash");
  const perUnitModelRisk = entry - stop + entry * estimatedRoundTripCostBps / 10000;
  const unitsByRisk = equity * riskFraction / perUnitModelRisk;
  const units = Math.min(unitsByRisk, cashAvailable / entry, equity / entry);
  return { units, notional: units * entry, modelLossAtStop: units * perUnitModelRisk, stopIsGuaranteed: false, leverage: 1 as const };
}

/** Conservative optional classroom-only Kelly: 0..2% of equity, never order sizing. */
export function fractionalKelly(winProbability: number, payoffRatio: number, reduction = .25) {
  fraction(winProbability, "win probability"); positive(payoffRatio, "payoff ratio");
  fraction(reduction, "reduction");
  return Math.min(.02, Math.max(0, reduction * (winProbability - (1 - winProbability) / payoffRatio)));
}

export function marketCapAndFDV(price: number, circulating: number, maxSupply: number) {
  positive(price, "token price"); positive(circulating, "circulating supply"); positive(maxSupply, "max supply");
  if (circulating > maxSupply) throw new RangeError("circulating exceeds max");
  return { marketCap: price * circulating, fullyDilutedValue: price * maxSupply, dilutionFraction: 1 - circulating / maxSupply };
}

/** Aligned synchronous simple daily returns; cash is residual weight; no shorts or leverage. */
export function historicalVaRAndES(equity: number, weights: readonly number[], observations: readonly (readonly number[])[], confidence = .975): RiskReport {
  positive(equity, "equity");
  if (!weights.length || !observations.length) throw new RangeError("missing portfolio history");
  if (!(confidence > 0 && confidence < 1)) throw new RangeError("invalid confidence");
  weights.forEach((w) => fraction(w, "spot weight"));
  if (weights.reduce((s, w) => s + w, 0) > 1 + 1e-10) throw new RangeError("leverage or shorts forbidden");
  const tailObservations = Math.ceil((1 - confidence) * observations.length);
  if (tailObservations < 5) throw new RangeError("insufficient tail observations: need >= 5");
  const losses = observations.map((row) => {
    if (row.length !== weights.length) throw new RangeError("unaligned asset returns");
    let pnl = 0;
    for (let i = 0; i < weights.length; i++) {
      const r = row[i], w = weights[i];
      if (r === undefined || w === undefined) throw new RangeError("missing return");
      finite(r, "return");
      if (r < -1) throw new RangeError("spot simple return below -100%");
      pnl += w * r;
    }
    return -equity * pnl;
  }).sort((a, b) => b - a);
  const threshold = losses[tailObservations - 1] ?? 0;
  const es = losses.slice(0, tailObservations).reduce((s, x) => s + x, 0) / tailObservations;
  return { varAmount: Math.max(0, threshold), expectedShortfall: Math.max(0, es), tailObservations, observations: observations.length, confidence };
}
