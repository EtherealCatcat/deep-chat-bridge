import type { AppConfig, Reminder } from "./types.js";
import type { Paths } from "./config.js";
import type { Rhythm } from "./rhythm.js";
import { readJson, writeJson } from "./store.js";
import { formatDateTime, zonedParts, zonedTimeToTs, addDays } from "./time.js";
import { addMilestone } from "./relationship.js";

function file(p: Paths): string {
  return p.state + "/reminders.json";
}

export function loadReminders(p: Paths): Reminder[] {
  const list = readJson<Reminder[]>(file(p), []);
  return Array.isArray(list) ? list : [];
}

export function saveReminders(p: Paths, list: Reminder[]): void {
  writeJson(file(p), list);
}

export function addReminder(
  p: Paths,
  config: AppConfig,
  input: { text: string; dueAt: number; kind?: "owner" | "care" },
): Reminder {
  const list = loadReminders(p);
  const reminder: Reminder = {
    id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    text: input.text.trim().slice(0, 200),
    dueAt: input.dueAt,
    kind: input.kind ?? "owner",
    status: "pending",
    createdAt: Date.now(),
  };
  list.push(reminder);
  saveReminders(p, list);
  addMilestone(p, config, "第一次让我记着事");
  return reminder;
}

export function markReminderDone(p: Paths, id: string): Reminder | null {
  const list = loadReminders(p);
  const item = list.find((r) => r.id === id);
  if (!item) return null;
  item.status = "done";
  item.doneAt = Date.now();
  saveReminders(p, list);
  return item;
}

export function cancelReminder(p: Paths, id: string): boolean {
  const list = loadReminders(p);
  const item = list.find((r) => r.id === id);
  if (!item) return false;
  item.status = "cancelled";
  saveReminders(p, list);
  return true;
}

export function pendingReminders(p: Paths): Reminder[] {
  return loadReminders(p)
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * 到点该说的提醒。owner 必达；care 只在醒着时出现，深夜自动推迟到醒来后 30 分钟。
 */
export function dueReminders(p: Paths, config: AppConfig, rhythm: Rhythm, now = Date.now()): Reminder[] {
  const list = loadReminders(p);
  const due: Reminder[] = [];
  let changed = false;
  for (const reminder of list) {
    if (reminder.status !== "pending" || reminder.dueAt > now) continue;
    if (reminder.kind === "care" && rhythm.phase === "asleep") {
      reminder.dueAt = rhythm.wakeAt + 30 * 60_000;
      changed = true;
      continue;
    }
    due.push(reminder);
  }
  if (changed) saveReminders(p, list);
  return due;
}

export function upcomingReminders(p: Paths, limit = 3): Reminder[] {
  return pendingReminders(p).slice(0, limit);
}

export function parseDue(input: string, config: AppConfig, now = Date.now()): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const tz = config.behavior.timezone;
  const direct = Date.parse(raw);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw) && Number.isFinite(direct)) return direct;

  const p = zonedParts(now, tz);
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

  const relative = /^(\d+)\s*(分钟|小时|天)后$/.exec(raw);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2] === "分钟" ? 60_000 : relative[2] === "小时" ? 3_600_000 : 86_400_000;
    return now + n * unit;
  }

  let day = today;
  let clock = raw;
  if (raw.startsWith("明天")) {
    day = addDays(today, 1);
    clock = raw.replace(/^明天\s*/, "");
  } else if (raw.startsWith("后天")) {
    day = addDays(today, 2);
    clock = raw.replace(/^后天\s*/, "");
  } else if (raw.startsWith("今天")) {
    clock = raw.replace(/^今天\s*/, "");
  } else if (raw.startsWith("今晚")) {
    clock = raw.replace(/^今晚\s*/, "");
  } else if (raw.startsWith("明早")) {
    day = addDays(today, 1);
    clock = raw.replace(/^明早\s*/, "");
  }
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const [y, mo, d] = day.split("-").map(Number);
  let ts = zonedTimeToTs(y, mo, d, hour, minute, tz);
  if (ts <= now && day === today && !raw.startsWith("今天")) ts += 86_400_000;
  return ts;
}

export function remindersText(list: Reminder[], config: AppConfig): string {
  if (!list.length) return "没有非做不可的事。";
  return list
    .map((r) => `${formatDateTime(r.dueAt, config.behavior.timezone)} ${r.text}${r.kind === "care" ? "（自己惦记的）" : ""}`)
    .join("；");
}
