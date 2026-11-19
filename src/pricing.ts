import type { AppConfig, UsageDay } from "./types.js";
import { dayKey, minutesOfDay, zonedParts } from "./time.js";
import { isWorkday } from "./holidays.js";

export interface Price {
  hit: number;
  miss: number;
  output: number;
}

export interface ModelPrices {
  key: string;
  label: string;
  offPeak: Price;
  peak: Price;
}

export const MODEL_PRICES: Record<string, ModelPrices> = {
  "deepseek-flash": {
    key: "deepseek-flash",
    label: "DeepSeek Flash",
    offPeak: { hit: 0.02, miss: 1, output: 4 },
    peak: { hit: 0.04, miss: 2, output: 8 },
  },
  "deepseek-v4-pro": {
    key: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    offPeak: { hit: 0.15, miss: 4.5, output: 13.5 },
    peak: { hit: 0.3, miss: 9, output: 27 },
  },
};

export function pricesFor(model: string): ModelPrices {
  const key = model.toLowerCase();
  if (key.includes("pro")) return MODEL_PRICES["deepseek-v4-pro"];
  return MODEL_PRICES["deepseek-flash"];
}

export const DEFAULT_PEAK_WINDOWS: { start: number; end: number }[] = [
  { start: 9 * 60, end: 12 * 60 },
  { start: 14 * 60, end: 18 * 60 },
];

function normalizeMinutes(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1439, Math.round(n))) : fallback;
}

export function normalizePeakWindows(windows: unknown): { start: number; end: number }[] {
  const rows = Array.isArray(windows) ? windows : [];
  const clean = rows
    .slice(0, 8)
    .map((row) => {
      const item = (row ?? {}) as { start?: unknown; end?: unknown };
      return {
        start: normalizeMinutes(item.start, -1),
        end: normalizeMinutes(item.end, -1),
      };
    })
    .filter((row) => row.start >= 0 && row.end >= 0 && row.start !== row.end);
  return clean.length ? clean.slice(0, 4) : DEFAULT_PEAK_WINDOWS.map((row) => ({ ...row }));
}

export function formatPeakWindow(window: { start: number; end: number }): string {
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${clock(window.start)}–${clock(window.end)}`;
}

/** 高峰：自定义时段，默认工作日 09:00–12:00、14:00–18:00，不含法定节假日。 */
export function isPeak(config: Pick<AppConfig, "cost" | "behavior">, ts = Date.now()): boolean {
  if (!config.cost.peakPolicy) return false;
  const key = dayKey(ts, 0, config.behavior.timezone);
  if (!isWorkday(key)) return false;
  const minutes = minutesOfDay(ts, config.behavior.timezone);
  return config.cost.peakWindows.some((window) =>
    window.start < window.end
      ? minutes >= window.start && minutes < window.end
      : minutes >= window.start || minutes < window.end,
  );
}

export interface PeakInfo {
  enabled: boolean;
  isPeak: boolean;
  label: string;
  nextChangeAt: number;
  nextIsPeak: boolean;
  peakWindow: string;
}

export function peakInfo(config: Pick<AppConfig, "cost" | "behavior">, ts = Date.now()): PeakInfo {
  const windows = config.cost.peakWindows;
  if (!config.cost.peakPolicy || !windows.length) {
    return {
      enabled: false,
      isPeak: false,
      label: "已关闭",
      nextChangeAt: ts,
      nextIsPeak: false,
      peakWindow: "全时段按闲时计费",
    };
  }
  const current = isPeak(config, ts);
  let next = ts;
  for (let i = 1; i <= 14 * 24; i++) {
    const candidate = ts + i * 5 * 60_000;
    if (isPeak(config, candidate) !== current) {
      next = candidate;
      break;
    }
  }
  return {
    enabled: true,
    isPeak: current,
    label: current ? "忙时" : "闲时",
    nextChangeAt: next,
    nextIsPeak: !current,
    peakWindow: windows.map(formatPeakWindow).join(" / "),
  };
}

export interface CostEstimate {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  costCny: number;
  peak: boolean;
}

export function estimateCost(
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  },
  model: string,
  peak: boolean,
): CostEstimate {
  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const completionTokens = Math.max(0, usage.completionTokens ?? 0);
  let hit = Math.max(0, usage.cacheHitTokens ?? 0);
  let miss = Math.max(0, usage.cacheMissTokens ?? 0);
  if (hit + miss === 0) miss = promptTokens;
  else if (hit + miss < promptTokens) miss += promptTokens - hit - miss;
  const p = pricesFor(model)[peak ? "peak" : "offPeak"];
  const costCny = (hit * p.hit + miss * p.miss + completionTokens * p.output) / 1_000_000;
  return {
    promptTokens,
    completionTokens,
    cacheHitTokens: hit,
    cacheMissTokens: miss,
    costCny: Math.round(costCny * 1_000_000) / 1_000_000,
    peak,
  };
}

export type BudgetState = "ok" | "tight" | "exhausted";

export interface CostPolicy {
  peakEnabled: boolean;
  isPeak: boolean;
  peakLabel: string;
  nextChangeAt: number;
  maxOutputTokens: number;
  historyMessages: number;
  maxToolSteps: number;
  allowProactive: boolean;
  allowSideCalls: boolean;
  allowDiary: boolean;
  allowConsolidation: boolean;
  allowOwnTime: boolean;
  allowWeb: boolean;
  budgetState: BudgetState;
  budgetLeftCny: number;
  reason: string;
}

export function costPolicy(config: AppConfig, usage: UsageDay, now = Date.now()): CostPolicy {
  const info = peakInfo(config, now);
  const peak = info.isPeak;
  const budget = Math.max(0, config.cost.dailyBudgetCny);
  const spent = usage.costCny;
  const left = Math.max(0, budget - spent);
  const budgetState: BudgetState = budget > 0 && spent >= budget ? "exhausted" : budget > 0 && spent >= budget * 0.8 ? "tight" : "ok";

  let maxOutputTokens = peak ? config.behavior.maxOutputTokensPeak : config.behavior.maxOutputTokens;
  let historyMessages = peak ? config.behavior.historyPeakMessages : config.behavior.historyMessages;
  let maxToolSteps = peak ? config.behavior.maxToolStepsPeak : config.behavior.maxToolSteps;
  let allowProactive = !peak;
  let allowSideCalls = !peak;
  let allowDiary = !peak;
  let allowConsolidation = !peak;
  let allowOwnTime = !peak;
  let allowWeb = !peak;

  if (budgetState === "tight") {
    allowOwnTime = false;
    allowWeb = false;
    allowProactive = false;
  }
  if (budgetState === "exhausted") {
    maxOutputTokens = Math.min(maxOutputTokens, 220);
    historyMessages = Math.min(historyMessages, 12);
    maxToolSteps = Math.min(maxToolSteps, 1);
    allowProactive = false;
    allowSideCalls = false;
    allowDiary = false;
    allowConsolidation = false;
    allowOwnTime = false;
    allowWeb = false;
  }

  const reasons: string[] = [];
  if (!info.enabled) reasons.push("峰谷已关闭");
  else if (peak) reasons.push("忙时降载");
  if (budgetState === "tight") reasons.push("预算 80%");
  if (budgetState === "exhausted") reasons.push("预算用尽，只回消息");
  if (!reasons.length) reasons.push("闲时");

  return {
    peakEnabled: info.enabled,
    isPeak: peak,
    peakLabel: info.label,
    nextChangeAt: info.nextChangeAt,
    maxOutputTokens,
    historyMessages,
    maxToolSteps,
    allowProactive,
    allowSideCalls,
    allowDiary,
    allowConsolidation,
    allowOwnTime,
    allowWeb,
    budgetState,
    budgetLeftCny: left,
    reason: reasons.join(" · "),
  };
}

export function formatCny(value: number): string {
  if (value <= 0) return "¥0";
  if (value < 0.01) return `¥${value.toFixed(4)}`;
  if (value < 1) return `¥${value.toFixed(3)}`;
  return `¥${value.toFixed(2)}`;
}

export function nextPeakLabel(ts: number, timeZone = "Asia/Shanghai"): string {
  const p = zonedParts(ts, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
