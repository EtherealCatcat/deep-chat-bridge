import path from "node:path";
import type { AppConfig, ChatMessage, LLMMessage } from "./types.js";
import type { Paths } from "./config.js";
import { appendJsonl, readJsonl, readText, writeJson, exists } from "./store.js";
import { addDays, dayKey, dayStartTs, formatClock } from "./time.js";

let counter = 0;

function newId(prefix: string): string {
  counter = (counter + 1) % 10_000;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function chatFile(p: Paths, day: string): string {
  return path.join(p.chat, `${day}.jsonl`);
}

export function appendChatMessage(
  p: Paths,
  config: AppConfig,
  input: Omit<ChatMessage, "id" | "ts" | "dayKey"> & { ts?: number },
): ChatMessage {
  const ts = input.ts ?? Date.now();
  const message: ChatMessage = {
    ...input,
    id: newId(input.role),
    ts,
    dayKey: dayKey(ts, config.behavior.rotateHour, config.behavior.timezone),
  };
  appendJsonl(chatFile(p, message.dayKey), message);
  return message;
}

export function readDayMessages(p: Paths, day: string): ChatMessage[] {
  return readJsonl<ChatMessage>(chatFile(p, day));
}

export function recentMessages(p: Paths, config: AppConfig, limit = 40): ChatMessage[] {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  const days = [addDays(today, -2), addDays(today, -1), today];
  const messages = days.flatMap((day) => readDayMessages(p, day));
  return messages.slice(-limit);
}

export function messagesBefore(p: Paths, config: AppConfig, ts: number, limit = 40): ChatMessage[] {
  const all = recentMessages(p, config, 300).filter((m) => m.ts < ts);
  return all.slice(-limit);
}

export function todayMessageCount(p: Paths, config: AppConfig): number {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  return readDayMessages(p, today).filter((m) => m.role === "user").length;
}

export function todayProactiveCount(p: Paths, config: AppConfig): number {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  return readDayMessages(p, today).filter((m) => m.role === "assistant" && m.meta?.proactive === true).length;
}

export function lastOwnerMessageAt(p: Paths, config: AppConfig): number {
  const messages = recentMessages(p, config, 200);
  const user = [...messages].reverse().find((m) => m.role === "user");
  return user?.ts ?? 0;
}

export function lastAssistantMessageAt(p: Paths, config: AppConfig): number {
  const messages = recentMessages(p, config, 200);
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");
  return assistant?.ts ?? 0;
}

export function toLLMHistory(messages: ChatMessage[], max: number): LLMMessage[] {
  const visible = messages
    .filter((m) => m.kind === "text" || m.kind === "sticker")
    .slice(-max)
    .map<LLMMessage>((m) => ({
      role: m.role,
      content: m.kind === "sticker" ? `[表情:${m.text}]` : m.text,
    }));
  return visible;
}

export function yesterdayDigest(p: Paths, config: AppConfig): string {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  const yesterday = addDays(today, -1);
  const diary = readText(path.join(p.diary, `${yesterday}.md`));
  if (diary.trim()) {
    return diary.trim().slice(0, 1600);
  }
  const messages = readDayMessages(p, yesterday).filter((m) => m.kind === "text");
  if (!messages.length) return "";
  return messages
    .slice(-24)
    .map((m) => `${m.role === "user" ? config.ownerTitle : config.name}：${m.text.replace(/\s+/g, " ").slice(0, 80)}`)
    .join("\n")
    .slice(0, 1600);
}

export function dayTranscriptForDiary(p: Paths, config: AppConfig, day: string, limit = 120): string {
  const messages = readDayMessages(p, day).filter((m) => m.kind === "text");
  return messages
    .slice(-limit)
    .map((m) => `[${formatClock(m.ts, config.behavior.timezone)}] ${m.role === "user" ? config.ownerTitle : config.name}：${m.text.replace(/\s+/g, " ")}`)
    .join("\n");
}

export function todayRange(config: AppConfig): { start: number; end: number } {
  const key = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  const start = dayStartTs(key, config.behavior.rotateHour, config.behavior.timezone);
  return { start, end: start + 86_400_000 };
}

/** Lightweight session metadata; the visible transcript lives in chat/*.jsonl. */
export interface SessionMeta {
  id: string;
  day: string;
  createdAt: number;
  messages: number;
  summary?: string;
}

export function ensureSession(p: Paths, config: AppConfig): SessionMeta {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  const file = path.join(p.sessions, `chat-${today}.json`);
  const meta: SessionMeta = {
    id: `chat-${today}`,
    day: today,
    createdAt: Date.now(),
    messages: readDayMessages(p, today).length,
    summary: yesterdayDigest(p, config),
  };
  if (!exists(file)) writeJson(file, meta);
  return meta;
}
