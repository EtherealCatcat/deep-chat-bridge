import path from "node:path";
import type { AppConfig, TimelineEvent } from "./types.js";
import type { Paths } from "./config.js";
import { appendJsonl, listFiles, readJsonl } from "./store.js";
import { dayKey, formatClock, weekdayCN } from "./time.js";

export function timelineFile(p: Paths, day: string): string {
  return path.join(p.timeline, `${day}.jsonl`);
}

export function appendTimeline(p: Paths, config: AppConfig, event: Omit<TimelineEvent, "ts"> & { ts?: number }): void {
  const ts = event.ts ?? Date.now();
  appendJsonl(timelineFile(p, dayKey(ts, config.behavior.rotateHour, config.behavior.timezone)), {
    ...event,
    ts,
  });
}

export function readTimeline(p: Paths, day: string): TimelineEvent[] {
  return readJsonl<TimelineEvent>(timelineFile(p, day));
}

const LABELS: Record<string, string> = {
  chat: "聊天",
  tell: "主动说话",
  read: "读东西",
  note: "笔记",
  room: "房间",
  mood: "心情",
  remind: "提醒",
  sleep: "睡着",
  wake: "醒来",
  diary: "日记",
  speak: "想你",
  web: "上网",
  bili: "刷视频",
  own: "自己的时间",
  resume_gap: "电脑睡了",
  memory: "记忆",
};

export function timelineSummary(p: Paths, config: AppConfig, day: string, limit = 14): string {
  const events = readTimeline(p, day);
  if (!events.length) return "今天还没发生什么。";
  const lines = events.slice(-limit).map((event) => {
    const label = LABELS[event.kind] ?? event.kind;
    return `${formatClock(event.ts, config.behavior.timezone)} ${label}：${event.text}`;
  });
  return lines.join("\n");
}

export function timelineForPrompt(p: Paths, config: AppConfig, day: string): string {
  const events = readTimeline(p, day);
  if (!events.length) return "（今天还很安静。）";
  return events
    .slice(-24)
    .map((event) => `${formatClock(event.ts, config.behavior.timezone)} ${event.text}`)
    .join("\n");
}

export function timelineDays(p: Paths, limit = 30): string[] {
  return listFiles(p.timeline, ".jsonl")
    .map((file) => path.basename(file, ".jsonl"))
    .sort()
    .reverse()
    .slice(0, limit);
}

export function dayHeading(day: string, config: AppConfig): string {
  return `${day} ${weekdayCN(day)}`;
}
