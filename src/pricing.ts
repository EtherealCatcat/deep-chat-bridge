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

/** 高峰：北京时间周一至周五 09:00–12:00、14:00–18:00，不含法定节假日。 */
export function isPeak(ts = Date.now(), timeZone = "Asia/Shanghai"): boolean {
  const key = dayKey(ts, 0, timeZone);
  if (!isWorkday(key)) return false;
  const minutes = minutesOfDay(ts, timeZone);
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}

export interface PeakInfo {
  isPeak: boolean;
  label: string;
  nextChangeAt: number;
  nextIsPeak: boolean;
  peakWindow: string;
}

export function peakInfo(ts = Date.now(), timeZone = "Asia/Shanghai"): PeakInfo {
  const current = isPeak(ts, timeZone);
  let next = ts;
  for (let i = 1; i <= 14 * 24; i++) {
    const candidate = ts + i * 5 * 60_000;
    if (isPeak(candidate, timeZone) !== current) {
      next = candidate;
      break;
    }
  }
  return {
    isPeak: current,
    label: current ? "忙时" : "闲时",
    nextChangeAt: next,
    nextIsPeak: !current,
    peakWindow: "工作日 09:00–12:00 / 14:00–18:00",
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
  const info = peakInfo(now, config.behavior.timezone);
  const peak = config.cost.peakPolicy && info.isPeak;
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
  if (peak) reasons.push("忙时降载");
  if (budgetState === "tight") reasons.push("预算 80%");
  if (budgetState === "exhausted") reasons.push("预算用尽，只回消息");
  if (!reasons.length) reasons.push("闲时");

  return {
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
