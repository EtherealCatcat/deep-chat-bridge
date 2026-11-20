import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
  canShareNow,
  defaultOwnTimeState,
  ensureOwnSchedule,
  markOwnEnd,
  markOwnStart,
  planOwnWindow,
  queueShare,
  scheduleOwnRetry,
  takeShares,
} from "../src/own.js";

const config = structuredClone(DEFAULT_CONFIG);
const now = new Date("2026-11-18T12:00:00+08:00").getTime();
const rng = () => 0.9;

describe("own time windows", () => {
  it("plans a slot inside a workday window", () => {
    const plan = planOwnWindow(config, now, defaultOwnTimeState(), rng);
    expect(plan).not.toBeNull();
    expect(plan!.nextAt).toBeGreaterThan(now);
    expect(plan!.windowEnd).toBeGreaterThan(plan!.nextAt);
    expect(plan!.windowEnd).toBeLessThanOrEqual(new Date("2026-11-18T15:00:00+08:00").getTime());
  });

  it("keeps an existing future slot stable", () => {
    const first = ensureOwnSchedule(config, now, defaultOwnTimeState(), rng);
    const second = ensureOwnSchedule(config, now + 60_000, first, rng);
    expect(second.nextAt).toBe(first.nextAt);
  });

  it("marks start and end and records a result", () => {
    const state = defaultOwnTimeState();
    state.windowKey = "2026-11-18:790";
    markOwnStart(state, now, now + 30 * 60_000);
    expect(state.activeUntil).toBeGreaterThan(now);
    expect(state.runsToday).toBe(1);
    markOwnEnd(state, now + 30 * 60_000, "  看了一篇\n关于海的文章  ");
    expect(state.activeUntil).toBe(0);
    expect(state.lastResult).toBe("看了一篇 关于海的文章");
  });

  it("limits shares per day and dedupes queued shares", () => {
    const state = defaultOwnTimeState();
    expect(canShareNow(state, config, now)).toBe(true);
    state.shareCount = config.speak.tellOwnerMaxPerDay;
    expect(canShareNow(state, config, now)).toBe(false);
    queueShare(state, "看到一只猫");
    queueShare(state, "看到一只猫");
    expect(takeShares(state)).toEqual(["看到一只猫"]);
    expect(state.pendingShares).toHaveLength(0);
  });

  it("gives back the quota on an infrastructure failure, once a day", () => {
    const state = defaultOwnTimeState();
    state.runsToday = 1;
    expect(scheduleOwnRetry(state, config, now)).toBe(true);
    expect(state.runsToday).toBe(0);
    expect(state.nextAt).toBe(now + 10 * 60_000);
    expect(state.windowEnd).toBeGreaterThan(state.nextAt);
    expect(state.retryDay).toBe("2026-11-18");

    state.runsToday = 1;
    expect(scheduleOwnRetry(state, config, now + 30 * 60_000)).toBe(false);
    expect(state.runsToday).toBe(1);
  });
});
