import type { AppConfig, OwnTimeState } from "./types.js";
import type { Paths } from "./config.js";
import { readJson, writeJson } from "./store.js";
import { addDays, dayKey, formatClock, zonedParts, zonedTimeToTs } from "./time.js";
import { isRestDay } from "./holidays.js";
import { isQuietHours } from "./rhythm.js";
import { isPeak } from "./pricing.js";

const WORK_WINDOWS: [number, number][] = [
  [12 * 60 + 10, 13 * 60 + 10],
  [18 * 60 + 20, 20 * 60],
  [20 * 60 + 40, 22 * 60],
];

const REST_WINDOWS: [number, number][] = [
  [10 * 60 + 20, 12 * 60],
  [15 * 60, 17 * 60],
  [20 * 60 + 40, 22 * 60],
];

function ownFile(p: Paths): string {
  return `${p.state}/own.json`;
}

export function defaultOwnTimeState(): OwnTimeState {
  return {
    nextAt: 0,
    windowEnd: 0,
    windowKey: "",
    activeUntil: 0,
    day: "",
    runsToday: 0,
    lastWindowKey: "",
    lastRunAt: 0,
    lastResult: "",
    unread: 0,
    shareDay: "",
    shareCount: 0,
    pendingShares: [],
    updatedAt: 0,
  };
}

export function loadOwn(p: Paths): OwnTimeState {
  const raw = readJson<Partial<OwnTimeState>>(ownFile(p), {});
  return {
    ...defaultOwnTimeState(),
    ...raw,
    pendingShares: Array.isArray(raw.pendingShares) ? raw.pendingShares.filter((s): s is string => typeof s === "string") : [],
  };
}

export function saveOwn(p: Paths, state: OwnTimeState): void {
  writeJson(ownFile(p), state);
}

function dayWindows(day: string): [number, number][] {
  return isRestDay(day) ? REST_WINDOWS : WORK_WINDOWS;
}

function tsForMinute(day: string, minute: number, timezone: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return zonedTimeToTs(year, month, date, Math.floor(minute / 60), minute % 60, timezone);
}

export interface OwnPlan {
  nextAt: number;
  windowEnd: number;
  key: string;
}

/**
 * Pick the next 1–2 own-time slots. Each candidate is skipped with 30% chance,
 * so some days only get one slot and some get none.
 */
export function planOwnWindow(
  config: AppConfig,
  now: number,
  state: OwnTimeState,
  rng: () => number = Math.random,
): OwnPlan | null {
  const baseDay = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
  for (let offset = 0; offset < 4; offset += 1) {
    const day = addDays(baseDay, offset);
    const runs = state.day === day ? state.runsToday : 0;
    if (runs >= 2) continue;
    for (const [startMin, endMin] of dayWindows(day)) {
      const key = `${day}:${startMin}`;
      if (key === state.lastWindowKey) continue;
      const startTs = tsForMinute(day, startMin, config.behavior.timezone);
      const endTs = tsForMinute(day, endMin, config.behavior.timezone);
      if (endTs <= now + 60_000) continue;
      if (rng() < 0.3) continue;

      const earliest = Math.max(startTs, now + 60_000);
      const latest = endTs - 20 * 60_000;
      if (latest < earliest) continue;

      const start = earliest + Math.floor(rng() * (latest - earliest));
      const duration = 20 + Math.floor(rng() * 41);
      return {
        nextAt: start,
        windowEnd: Math.min(endTs, start + duration * 60_000),
        key,
      };
    }
  }
  return null;
}

export function ensureOwnSchedule(
  config: AppConfig,
  now: number,
  current: OwnTimeState,
  rng: () => number = Math.random,
): OwnTimeState {
  const state = current;
  if (!config.web.ownTimeEnabled) {
    state.nextAt = 0;
    state.windowEnd = 0;
    state.activeUntil = 0;
    return state;
  }

  const today = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
  if (state.day !== today) {
    state.day = today;
    state.runsToday = 0;
    state.shareDay = today;
    state.shareCount = 0;
  }
  if (state.activeUntil && state.activeUntil <= now) state.activeUntil = 0;
  if (state.activeUntil > now) return state;
  if (state.nextAt && state.windowEnd > now) {
    const bad = (config.cost.peakPolicy && isPeak(state.nextAt, config.behavior.timezone)) || isQuietHours(config, state.nextAt);
    if (!bad) return state;
    state.nextAt = 0;
    state.windowEnd = 0;
  }

  const plan = planOwnWindow(config, now, state, rng);
  if (plan) {
    state.nextAt = plan.nextAt;
    state.windowEnd = plan.windowEnd;
    state.windowKey = plan.key;
  } else {
    state.nextAt = now + 30 * 60_000;
    state.windowEnd = state.nextAt;
    state.windowKey = "retry";
  }
  state.updatedAt = now;
  return state;
}

export function markOwnStart(state: OwnTimeState, now: number, windowEnd: number): void {
  state.activeUntil = windowEnd;
  state.runsToday += 1;
  state.lastWindowKey = state.windowKey;
  state.nextAt = 0;
  state.updatedAt = now;
}

export function markOwnEnd(state: OwnTimeState, now: number, result: string): void {
  state.activeUntil = 0;
  state.lastRunAt = now;
  state.lastResult = result.replace(/\s+/g, " ").trim().slice(0, 320);
  if (state.lastResult) state.unread = (state.unread ?? 0) + 1;
  state.nextAt = 0;
  state.windowEnd = 0;
  state.windowKey = "";
  state.updatedAt = now;
}

export function ownLabel(state: OwnTimeState, now: number, timezone: string): string {
  if (state.activeUntil > now) return "在过自己的时间";
  if (state.nextAt > now) return `下次 ${formatClock(state.nextAt, timezone)}`;
  return "今天不打算上网";
}

export function resetShareDay(state: OwnTimeState, config: AppConfig, now: number): void {
  const today = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
  if (state.shareDay !== today) {
    state.shareDay = today;
    state.shareCount = 0;
  }
}

export function canShareNow(state: OwnTimeState, config: AppConfig, now: number): boolean {
  resetShareDay(state, config, now);
  if (state.shareCount >= config.speak.tellOwnerMaxPerDay) return false;
  return !isQuietHours(config, now);
}

export function queueShare(state: OwnTimeState, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  if (!state.pendingShares.includes(clean)) state.pendingShares.push(clean);
  state.pendingShares = state.pendingShares.slice(-6);
}

export function takeShares(state: OwnTimeState): string[] {
  const list = state.pendingShares;
  state.pendingShares = [];
  return list;
}

export function ownStateSnapshot(state: OwnTimeState, config: AppConfig, now: number) {
  return {
    enabled: config.web.ownTimeEnabled,
    active: state.activeUntil > now,
    nextAt: state.nextAt,
    windowEnd: state.windowEnd,
    label: ownLabel(state, now, config.behavior.timezone),
    lastResult: state.lastResult,
    unread: state.unread ?? 0,
  };
}

export function markOwnSeen(state: OwnTimeState): void {
  state.unread = 0;
  state.updatedAt = Date.now();
}

export function nextOwnWindowLabel(config: AppConfig, now: number, state: OwnTimeState): string {
  if (!config.web.ownTimeEnabled) return "自己的时间关着";
  if (state.activeUntil > now) return "正在过自己的时间";
  if (state.nextAt > now) {
    const day = dayKey(state.nextAt, config.behavior.rotateHour, config.behavior.timezone);
    const today = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
    const prefix = day === today ? "今天" : day === addDays(today, 1) ? "明天" : day;
    return `${prefix} ${formatClock(state.nextAt, config.behavior.timezone)}`;
  }
  return "还没安排";
}

export function windowTimeLabel(ts: number, timezone: string): string {
  const p = zonedParts(ts, timezone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
