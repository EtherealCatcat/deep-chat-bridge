export type Page =
  | "chat"
  | "today"
  | "memory"
  | "diary"
  | "persona"
  | "growth"
  | "settings"
  | "debug";

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

export interface PeakInfo {
  isPeak: boolean;
  label: string;
  nextChangeAt: number;
  nextIsPeak: boolean;
  peakWindow: string;
}

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
  budgetState: "ok" | "tight" | "exhausted";
  budgetLeftCny: number;
  reason: string;
}

export interface UsageDay {
  date: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  costCny: number;
  peakCalls: number;
  offPeakCalls: number;
  peakCostCny: number;
  offPeakCostCny: number;
}

export interface MoodState {
  base: number;
  dims: Record<string, number>;
  updatedAt: number;
  history: {
    ts: number;
    base: number;
    dims: Record<string, number>;
    reason: string;
    source: string;
  }[];
}

export interface Relationship {
  firstMet: string;
  daysKnown?: number;
  trust: number;
  intimacy: number;
  streak: number;
  milestones: { date: string; text: string }[];
  updatedAt: number;
}

export interface RoomState {
  name: string;
  status: string;
  detail: string;
  updatedAt: number;
}

export type Phase = "asleep" | "waking" | "awake" | "sleepy";

export interface Status {
  name: string;
  ownerTitle: string;
  busy: boolean;
  burst: boolean;
  burstCount: number;
  unread: number;
  serverTime: number;
  mood: MoodState;
  moodLabel: string;
  rhythm: {
    phase: Phase;
    label: string;
    status: string;
    sleepAt: number;
    wakeAt: number;
    nextChangeAt: number;
    woken: boolean;
    day: string;
    dayType: string;
  };
  room: RoomState;
  relationship: Relationship;
  pricing: CostPolicy;
  usage: UsageDay;
  todayMessages: number;
  proactiveToday: number;
  lastOwnerAt: number;
  lastMessageAt: number;
  activity: string;
  own: {
    enabled: boolean;
    active: boolean;
    nextAt: number;
    windowEnd: number;
    label: string;
    lastResult: string;
  };
}

export interface QuoteRef {
  id: string;
  role: "user" | "assistant";
  kind: ChatMessage["kind"];
  text: string;
  ts: number;
}

export interface ChatMessage {
  id: string;
  ts: number;
  role: "user" | "assistant";
  kind: "text" | "sticker" | "image" | "monologue" | "silent" | "proactive";
  text: string;
  dayKey: string;
  meta?: Record<string, unknown>;
  quote?: QuoteRef;
}

export type ServerEvent =
  | { type: "status"; status: Status }
  | { type: "message"; message: ChatMessage }
  | { type: "typing"; on: boolean }
  | { type: "read"; at: number }
  | { type: "mood"; mood: MoodState }
  | { type: "timeline"; event: TimelineEvent }
  | { type: "busy"; busy: boolean }
  | { type: "error"; message: string }
  | { type: "done"; turnId: string }
  | { type: "diary"; day: string };

export interface TimelineEvent {
  ts: number;
  kind: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: number;
  kind: "owner" | "care";
  status: "pending" | "done" | "cancelled";
  createdAt: number;
  doneAt?: number;
}

export interface DiaryMeta {
  day: string;
  title: string;
  preview: string;
}

export interface MemorySnapshot {
  owner: string;
  me: string;
  we: string;
  topics: { title: string; content: string }[];
  inbox: string[];
}

export interface ModelConfig {
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  sideModel: string;
  temperature: number;
  thinking: boolean;
}

export interface AppConfig {
  name: string;
  ownerTitle: string;
  model: ModelConfig;
  behavior: {
    rotateHour: number;
    historyMessages: number;
    historyPeakMessages: number;
    maxOutputTokens: number;
    maxOutputTokensPeak: number;
    maxToolSteps: number;
    maxToolStepsPeak: number;
    burstMs: number;
    typingCps: number;
    maxBubbles: number;
    timezone: string;
  };
  life: {
    sleepMin: number;
    wakeMin: number;
    weekendSleepMin: number;
    weekendWakeMin: number;
    whenAsleep: "wake" | "sleepy" | "morning";
    diaryEnabled: boolean;
  };
  speak: {
    enabled: boolean;
    intervalMin: number;
    chance: number;
    minSilenceMin: number;
    quietStart: number;
    quietEnd: number;
    maxPerDay: number;
    tellOwnerMaxPerDay: number;
  };
  mood: { enabled: boolean; base: number; halfLifeHours: number };
  cost: { dailyBudgetCny: number; peakPolicy: boolean };
  web: { enabled: boolean; ownTimeEnabled: boolean; rssFeeds: string[] };
  ui: { port: number };
}

export interface SettingsPayload {
  config: AppConfig;
  root: string;
  pricing: PeakInfo;
  prices: Record<string, ModelPrices>;
  modelOptions: { value: string; label: string }[];
}

export interface DebugPayload {
  status: Status;
  life: Record<string, unknown>;
  own: Record<string, unknown>;
  deferred: unknown[];
  usage: UsageDay;
  timeline: TimelineEvent[];
  lastTurn: {
    at: number;
    system: string;
    nowBlock: string;
    history: unknown[];
    raw: string;
    toolCalls: unknown[];
    bubbles: unknown[];
    silent: boolean;
  } | null;
  config: AppConfig;
}
