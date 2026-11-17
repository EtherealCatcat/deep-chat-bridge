import type { AppConfig, LifeState } from "./types.js";
import { addDays, dayKey, isWeekendKey } from "./time.js";
import { isRestDay, dayTypeLabel } from "./holidays.js";
import { zonedParts, zonedTimeToTs } from "./time.js";

export type Phase = "asleep" | "waking" | "awake" | "sleepy";

export interface Rhythm {
  phase: Phase;
  label: string;
  status: string;
  sleepAt: number;
  wakeAt: number;
  nextChangeAt: number;
  woken: boolean;
  day: string;
  dayType: string;
  sleepMin: number;
  wakeMin: number;
}

function sleepMinutesFor(config: AppConfig, day: string): number {
  return isRestDay(addDays(day, 1)) ? config.life.weekendSleepMin : config.life.sleepMin;
}

function wakeMinutesFor(config: AppConfig, day: string): number {
  return isRestDay(day) ? config.life.weekendWakeMin : config.life.wakeMin;
}

function clockFromMinutes(minutes: number): { hour: number; minute: number } {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return { hour: Math.floor(normalized / 60), minute: normalized % 60 };
}

function tsAt(day: string, minutes: number, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const clock = clockFromMinutes(minutes);
  return zonedTimeToTs(y, m, d, clock.hour, clock.minute, timeZone);
}

export function getRhythm(config: AppConfig, life: LifeState, now = Date.now()): Rhythm {
  const p = zonedParts(now, config.behavior.timezone);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const sleepMin = sleepMinutesFor(config, day);
  const wakeMin = wakeMinutesFor(config, day);
  const todayWake = tsAt(day, wakeMin, config.behavior.timezone);
  const todaySleepAt = tsAt(addDays(day, 1), sleepMin, config.behavior.timezone);
  const prevDay = addDays(day, -1);
  const prevSleepAt = tsAt(day, sleepMinutesFor(config, prevDay), config.behavior.timezone);
  const sleepAt = todaySleepAt;

  let phase: Phase;
  let nextChangeAt: number;
  if (now < todayWake) {
    // 凌晨：可能还没睡（00:10），也可能已经睡了（00:40 以后）。
    if (now >= prevSleepAt) {
      phase = "asleep";
      nextChangeAt = todayWake;
    } else if (prevSleepAt - now <= 90 * 60_000) {
      phase = "sleepy";
      nextChangeAt = prevSleepAt;
    } else {
      phase = "awake";
      nextChangeAt = prevSleepAt;
    }
  } else if (now - todayWake < 25 * 60_000) {
    phase = "waking";
    nextChangeAt = todayWake + 25 * 60_000;
  } else if (todaySleepAt - now <= 90 * 60_000) {
    phase = "sleepy";
    nextChangeAt = todaySleepAt;
  } else {
    phase = "awake";
    nextChangeAt = todaySleepAt;
  }

  const woken = life.wokenAt > 0 && now - life.wokenAt < 25 * 60_000;
  const label = phase === "asleep" ? "睡着中" : phase === "waking" ? "刚醒" : phase === "sleepy" ? "有点困" : "醒着";
  const status =
    phase === "asleep"
      ? woken
        ? "刚被消息吵醒，还埋在枕头里"
        : "睡着中，呼吸很轻"
      : phase === "waking"
        ? "刚醒，头发乱糟糟的"
        : phase === "sleepy"
          ? "困了，眼皮在打架"
          : "醒着，在自己的房间里";

  return {
    phase,
    label,
    status,
    sleepAt,
    wakeAt: todayWake,
    nextChangeAt,
    woken,
    day,
    dayType: dayTypeLabel(day),
    sleepMin,
    wakeMin,
  };
}

export function rhythmPrompt(rhythm: Rhythm, config: AppConfig): string {
  if (rhythm.phase === "asleep") {
    if (config.life.whenAsleep === "morning") return "你正睡着。这条消息先不回复，等早上醒来再说。";
    if (config.life.whenAsleep === "sleepy") return "你正睡着，被这条消息吵醒了。脑子还糊着，可以回，但短一点、慢一点，带点起床气也可以。";
    return "你正睡着，被这条消息吵醒了。先回一句，别装清醒。";
  }
  if (rhythm.phase === "waking") return "你刚醒没多久，还没完全清醒。说话可以慢半拍，别太利索。";
  if (rhythm.phase === "sleepy") return "你有点困了，眼皮打架。回复会短一些，可能说着说着就想睡。";
  return "你醒着，状态正常。";
}

export function isQuietHours(config: AppConfig, now = Date.now()): boolean {
  const p = zonedParts(now, config.behavior.timezone);
  const minutes = p.hour * 60 + p.minute;
  const start = config.speak.quietStart;
  const end = config.speak.quietEnd;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

export function isOwnTimeWindow(config: AppConfig, now = Date.now()): boolean {
  const p = zonedParts(now, config.behavior.timezone);
  const minutes = p.hour * 60 + p.minute;
  if (isRestDay(dayKey(now, 0, config.behavior.timezone))) {
    return (minutes >= 10 * 60 && minutes < 11 * 60 + 30) || (minutes >= 14 * 60 + 30 && minutes < 17 * 60 + 30) || (minutes >= 20 * 60 && minutes < 22 * 60 + 30);
  }
  return (minutes >= 12 * 60 && minutes < 13 * 60 + 30) || (minutes >= 19 * 60 + 30 && minutes < 22 * 60 + 30);
}

export function isWeekend(config: AppConfig, now = Date.now()): boolean {
  return isWeekendKey(dayKey(now, 0, config.behavior.timezone));
}
