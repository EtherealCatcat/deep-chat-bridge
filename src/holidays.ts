import { addDays, isWeekendKey, weekdayOf } from "./time.js";

/**
 * 中国法定节假日（含调休）。用于「她的作息」和 DeepSeek 峰谷计费。
 * 计费高峰只认周一到周五；调休上班的周末仍按周末算空闲。
 */
const HOLIDAYS: Record<string, string> = {};

function span(start: string, end: string, name: string): void {
  let cursor = start;
  for (let i = 0; i < 400; i++) {
    HOLIDAYS[cursor] = name;
    if (cursor === end) break;
    cursor = addDays(cursor, 1);
  }
}

// 2026
span("2026-01-01", "2026-01-03", "元旦");
span("2026-02-15", "2026-02-23", "春节");
span("2026-04-04", "2026-04-06", "清明");
span("2026-05-01", "2026-05-05", "劳动节");
span("2026-06-19", "2026-06-21", "端午");
span("2026-09-25", "2026-09-27", "中秋");
span("2026-10-01", "2026-10-07", "国庆");

// 2027
span("2027-01-01", "2027-01-03", "元旦");
span("2027-02-05", "2027-02-13", "春节");
span("2027-04-03", "2027-04-05", "清明");
span("2027-05-01", "2027-05-05", "劳动节");
span("2027-06-09", "2027-06-09", "端午");
span("2027-09-15", "2027-09-15", "中秋");
span("2027-10-01", "2027-10-07", "国庆");

export const MAKEUP_WORKDAYS = new Set([
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
  "2027-01-31",
  "2027-02-14",
  "2027-05-08",
  "2027-09-26",
  "2027-10-09",
]);

export function holidayName(key: string): string | null {
  return HOLIDAYS[key] ?? null;
}

export function isHoliday(key: string): boolean {
  return Boolean(HOLIDAYS[key]);
}

export function isMakeupWorkday(key: string): boolean {
  return MAKEUP_WORKDAYS.has(key);
}

/** 行政日历意义下的工作日：调休上班算上班，法定节假日不算。 */
export function isWorkday(key: string): boolean {
  if (isMakeupWorkday(key)) return true;
  if (isHoliday(key)) return false;
  return !isWeekendKey(key);
}

/** 她的「明天休不休」：周末或法定节假日都算休息。 */
export function isRestDay(key: string): boolean {
  return isHoliday(key) || isWeekendKey(key);
}

export function dayTypeLabel(key: string): string {
  const h = holidayName(key);
  if (h) return h;
  if (isMakeupWorkday(key)) return "调休上班";
  const w = weekdayOf(key);
  if (w === 0 || w === 6) return "周末";
  return "工作日";
}
