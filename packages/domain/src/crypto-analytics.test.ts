import { describe, expect, it } from "vitest";
import { atrWilder, bidAskSpread, bollinger, fibonacciRetracements, fractionalKelly, historicalVaRAndES, macd, marketCapAndFDV, previewMarketSweep, rsiWilder, spotPositionSizing, tradeVWAP } from "./crypto-analytics.js";

describe("IDA Crypto - deterministic spot-only analytics", () => {
  it("calculates spread and order book impact and refuses thin depth", () => {
    expect(bidAskSpread(99, 101).basisPoints).toBeCloseTo(200);
    expect(previewMarketSweep("BUY", 2, [{price: 101, quantity: 1}, {price: 103, quantity: 1}])).toMatchObject({status: "FILLED_IN_SIMULATION", vwap: 102});
    expect(previewMarketSweep("BUY", 3, [{price: 101, quantity: 1}]).status).toBe("INSUFFICIENT_DEPTH");
    expect(tradeVWAP([{price: 10, quantity: 1}, {price: 20, quantity: 3}])).toBe(17.5);
    expect(() => bidAskSpread(105, 100)).toThrow();
  });
  it("keeps indicators bounded and transparent about warm-up history", () => {
    expect(rsiWilder(Array.from({length: 20}, () => 10))).toBe(50);
    expect(rsiWilder(Array.from({length: 20}, (_, i) => i + 1))).toBe(100);
    expect(bollinger(Array.from({length: 25}, () => 10))).toMatchObject({middle: 10, upper: 10, lower: 10});
    const prices = Array.from({length: 40}, (_, i) => 100 + i);
    expect(macd(prices).macd).toBeGreaterThan(0);
    expect(atrWilder(Array.from({length: 25}, (_, i) => ({high: 101+i, low: 99+i, close: 100+i})))).toBeCloseTo(2);
    expect(fibonacciRetracements(100, 200)["50"]).toBe(150);
    expect(() => macd([1,2,3])).toThrow();
  });
  it("never recommends borrowed capital and warns stops are only modeled", () => {
    const sized = spotPositionSizing({equity: 100, entry: 10, stop: 9, riskFraction: .01, estimatedRoundTripCostBps: 50, cashAvailable: 10});
    expect(sized.notional).toBeLessThanOrEqual(10);
    expect(sized.modelLossAtStop).toBeLessThanOrEqual(1.001);
    expect(sized.stopIsGuaranteed).toBe(false);
    expect(sized.leverage).toBe(1);
    expect(fractionalKelly(1, 1, .5)).toBe(.02);
    expect(() => spotPositionSizing({equity: 100, entry: 10, stop: 11, riskFraction: .01, estimatedRoundTripCostBps: 0, cashAvailable: 100})).toThrow();
  });
  it("handles token dilution, historical tail losses and no leverage", () => {
    expect(marketCapAndFDV(2, 25, 100)).toMatchObject({marketCap: 50, fullyDilutedValue: 200, dilutionFraction: .75});
    const observations = Array.from({length: 500}, (_, i) => [i < 5 ? -.5 : .01]);
    const report = historicalVaRAndES(100, [1], observations, .99);
    expect(report.tailObservations).toBe(5);
    expect(report.expectedShortfall).toBeGreaterThanOrEqual(report.varAmount);
    expect(report.expectedShortfall).toBeGreaterThan(0);
    expect(() => historicalVaRAndES(100, [1.2], observations)).toThrow("spot weight");
    expect(() => historicalVaRAndES(100, [1], [[.01]], .99)).toThrow("insufficient");
  });
});
