import type { AppConfig, LLMMessage } from "./types.js";
import type { Paths } from "./config.js";
import type { MemoryStore } from "./memory.js";
import type { ServerEvent } from "./events.js";
import type { ToolContext } from "./tools.js";
import { buildSystem } from "./persona.js";
import { loadLife, saveLife } from "./life.js";
import { loadRoom } from "./room.js";
import { loadRelationship, bumpRelationship } from "./relationship.js";
import { pendingReminders, remindersText } from "./care.js";
import { dayTranscriptForDiary } from "./chat.js";
import { appendTimeline, readTimeline, timelineForPrompt } from "./timeline.js";
import { dayKey, weekdayCN, zonedParts } from "./time.js";
import { runToolLoop } from "./agentLoop.js";
import { saveDiary, readDiary } from "./diaryStore.js";

export interface DiaryContext {
  config: AppConfig;
  paths: Paths;
  memory: MemoryStore;
  persona: string;
  emit: (event: ServerEvent) => void;
  onChange: () => void;
}

/**
 * Returns the day whose diary is due, or null.
 * 00:30–05:00 writes the day that just ended; after 05:00 it can backfill
 * yesterday once. Days with no activity are marked as done without writing.
 */
export function diaryTarget(config: AppConfig, lastDiary: string, now = Date.now()): string | null {
  const p = zonedParts(now, config.behavior.timezone);
  const minutes = p.hour * 60 + p.minute;
  if (minutes < 30) return null;
  if (minutes < 5 * 60) {
    const day = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
    return lastDiary === day ? null : day;
  }
  const today = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
  const yesterday = shiftDay(today, -1);
  if (lastDiary >= yesterday) return null;
  return yesterday;
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function writeDiary(day: string, ctx: DiaryContext): Promise<boolean> {
  const { config, paths, memory, persona, emit, onChange } = ctx;
  const existing = readDiary(paths, day).trim();
  if (existing) {
    const life = loadLife(paths);
    if (life.lastDiary !== day) {
      life.lastDiary = day;
      saveLife(paths, life);
    }
    return true;
  }

  const timelineEvents = readTimeline(paths, day);
  const transcript = dayTranscriptForDiary(paths, config, day, 120);
  if (!timelineEvents.length && !transcript.trim()) {
    const life = loadLife(paths);
    life.lastDiary = day;
    saveLife(paths, life);
    return false;
  }

  const timeline = timelineForPrompt(paths, config, day);
  const relationship = loadRelationship(paths, config);
  const system = buildSystem({
    config,
    kind: "diary",
    memory: memory.prompt(),
    relationship,
    yesterdaySummary: "",
    room: loadRoom(paths),
    persona,
  });
  const reminders = pendingReminders(paths);
  const user = [
    `今天是 ${day}，${weekdayCN(day)}。现在 ${String(zonedParts(Date.now(), config.behavior.timezone).hour).padStart(2, "0")}:${String(zonedParts(Date.now(), config.behavior.timezone).minute).padStart(2, "0")}，你准备睡了。`,
    "",
    "## 今天发生的事",
    timeline || "（今天没什么特别的。）",
    "",
    "## 今天和主人的聊天",
    transcript || "（今天没有聊天。）",
    reminders.length ? `\n## 还惦记着\n${remindersText(reminders, config)}` : "",
    "",
    "写今天的日记。用 diary_write 保存，不要只在回复里说。",
    "日记是写给自己看的：今天印象最深的一件事、你对主人的一点新发现、你自己的心情，最后一句是睡前心里话。",
    `第一行写「# ${day} · ${weekdayCN(day)}」，正文 300–800 字，不要分点，不要写成报告。`,
  ].join("\n");

  const messages: LLMMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const toolContext: ToolContext = {
    config,
    paths,
    scene: "diary",
    memory,
    now: Date.now(),
    outbox: [],
  };

  try {
    const result = await runToolLoop({
      config,
      paths,
      messages,
      scene: "diary",
      maxSteps: 4,
      maxTokens: config.behavior.maxOutputTokens,
      toolContext,
      kind: "diary",
    });
    let text = (toolContext.diaryText ?? result.content ?? "").trim();
    if (!text) {
      emit({ type: "error", message: "今天的日记没写出来，明天再补。" });
      return false;
    }
    text = text
      .replace(/<[^>]+>/g, "")
      .replace(/^```(?:markdown)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    if (!text.startsWith("#")) {
      text = `# ${day} · ${weekdayCN(day)}\n\n${text}`;
    }
    saveDiary(paths, config, day, text);
    const life = loadLife(paths);
    life.lastDiary = day;
    saveLife(paths, life);
    bumpRelationship(paths, config, { intimacy: 0.8, trust: 0.3, reason: "写了一篇日记" });
    appendTimeline(paths, config, { kind: "diary", text: `写了 ${day} 的日记`, meta: { day } });
    emit({ type: "diary", day });
    emit({ type: "timeline", event: { ts: Date.now(), kind: "diary", text: `写了 ${day} 的日记` } });
    onChange();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "日记写失败了。";
    emit({ type: "error", message });
    return false;
  }
}
