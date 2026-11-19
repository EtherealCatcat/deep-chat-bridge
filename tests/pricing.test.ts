import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { DEFAULT_PEAK_WINDOWS, costPolicy, estimateCost, isPeak, normalizePeakWindows } from "../src/pricing.js";
import type { UsageDay } from "../src/types.js";

const config = structuredClone(DEFAULT_CONFIG);

function at(iso: string): number {
  return new Date(iso).getTime();
}

const emptyUsage: UsageDay = {
  date: "2026-11-18",
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  costCny: 0,
  peakCalls: 0,
  offPeakCalls: 0,
  peakCostCny: 0,
  offPeakCostCny: 0,
};

describe("peak pricing", () => {
  it("treats weekday office hours as peak and lunch as off-peak", () => {
    expect(isPeak(config, at("2026-11-18T10:00:00+08:00"))).toBe(true);
    expect(isPeak(config, at("2026-11-18T13:00:00+08:00"))).toBe(false);
    expect(isPeak(config, at("2026-11-18T15:00:00+08:00"))).toBe(true);
    expect(isPeak(config, at("2026-11-18T19:00:00+08:00"))).toBe(false);
  });

  it("treats weekends and holidays as off-peak", () => {
    expect(isPeak(config, at("2026-11-21T10:00:00+08:00"))).toBe(false);
    expect(isPeak(config, at("2026-10-01T10:00:00+08:00"))).toBe(false);
  });

  it("counts make-up workdays as peak", () => {
    expect(isPeak(config, at("2026-10-10T10:00:00+08:00"))).toBe(true);
  });

  it("shrinks the budget under peak pricing", () => {
    const peak = costPolicy(config, emptyUsage, at("2026-11-18T10:00:00+08:00"));
    const off = costPolicy(config, emptyUsage, at("2026-11-18T20:00:00+08:00"));
    expect(peak.isPeak).toBe(true);
    expect(peak.maxOutputTokens).toBeLessThan(off.maxOutputTokens);
    expect(peak.historyMessages).toBeLessThan(off.historyMessages);
    expect(peak.allowProactive).toBe(false);
    expect(off.allowProactive).toBe(true);
  });

  it("supports custom peak windows and a master switch", () => {
    const custom = structuredClone(config);
    custom.cost.peakWindows = [{ start: 20 * 60, end: 22 * 60 }];
    expect(isPeak(custom, at("2026-11-18T10:00:00+08:00"))).toBe(false);
    expect(isPeak(custom, at("2026-11-18T21:00:00+08:00"))).toBe(true);

    custom.cost.peakPolicy = false;
    expect(isPeak(custom, at("2026-11-18T21:00:00+08:00"))).toBe(false);
    const off = costPolicy(custom, emptyUsage, at("2026-11-18T21:00:00+08:00"));
    expect(off.peakEnabled).toBe(false);
    expect(off.isPeak).toBe(false);
    expect(off.allowProactive).toBe(true);
    expect(off.allowSideCalls).toBe(true);
    expect(off.peakLabel).toBe("已关闭");
  });

  it("normalizes custom windows and falls back to defaults", () => {
    expect(normalizePeakWindows([])).toEqual(DEFAULT_PEAK_WINDOWS);
    expect(normalizePeakWindows([{ start: -10, end: 2000 }, { start: 600, end: 600 }])).toEqual([
      { start: 0, end: 1439 },
    ]);
    expect(normalizePeakWindows([{ start: 100, end: 200 }, { start: 300, end: 400 }, { start: 500, end: 600 }, { start: 700, end: 800 }, { start: 900, end: 1000 }])).toHaveLength(4);
  });

  it("estimates cache hits cheaper than misses", () => {
    const cached = estimateCost({ promptTokens: 100_000, completionTokens: 10_000, cacheHitTokens: 90_000 }, config.model.model, true);
    const uncached = estimateCost({ promptTokens: 100_000, completionTokens: 10_000 }, config.model.model, false);
    expect(cached.costCny).toBeLessThan(uncached.costCny);
  });
});
