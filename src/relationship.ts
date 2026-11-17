import fs from "node:fs";
import type { AppConfig, Relationship } from "./types.js";
import type { Paths } from "./config.js";
import { readJson, writeJson } from "./store.js";
import { dayKey, addDays, formatClock } from "./time.js";
import { daysSince } from "./persona.js";

export function defaultRelationship(config: AppConfig): Relationship {
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  return {
    firstMet: today,
    daysKnown: 1,
    trust: 50,
    intimacy: 30,
    streak: 0,
    milestones: [{ date: today, text: "第一次说话" }],
    updatedAt: Date.now(),
  };
}

export function loadRelationship(p: Paths, config: AppConfig): Relationship {
  const state = readJson<Relationship>(p.state + "/relationship.json", defaultRelationship(config));
  if (!state.firstMet) state.firstMet = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  state.daysKnown = daysSince(state.firstMet, config);
  if (!Array.isArray(state.milestones)) state.milestones = [];
  return state;
}

export function saveRelationship(p: Paths, relationship: Relationship): void {
  writeJson(p.state + "/relationship.json", relationship);
}

export interface RelationshipBump {
  trust?: number;
  intimacy?: number;
  milestone?: string;
  reason?: string;
}

export function bumpRelationship(p: Paths, config: AppConfig, bump: RelationshipBump): Relationship {
  const state = loadRelationship(p, config);
  const next: Relationship = {
    ...state,
    trust: clamp(state.trust + (bump.trust ?? 0), 0, 100),
    intimacy: clamp(state.intimacy + (bump.intimacy ?? 0), 0, 100),
    updatedAt: Date.now(),
  };
  if (bump.milestone && !next.milestones.some((m) => m.text === bump.milestone)) {
    next.milestones.push({
      date: dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone),
      text: bump.milestone,
    });
  }
  next.daysKnown = daysSince(next.firstMet, config);
  saveRelationship(p, next);
  return next;
}

export function updateStreak(p: Paths, config: AppConfig): Relationship {
  const state = loadRelationship(p, config);
  const today = dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  // 连续说话天数：从今天往回数，日子连续且当天有聊天记录。
  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 365; i++) {
    const file = `${p.chat}/${cursor}.jsonl`;
    const has = safeHasMessages(file);
    if (has) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else if (i === 0) {
      // 今天还没说话，不算断，继续看昨天
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  const next = { ...state, streak, daysKnown: daysSince(state.firstMet, config), updatedAt: Date.now() };
  saveRelationship(p, next);
  return next;
}

function safeHasMessages(file: string): boolean {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

export function relationshipDescription(relationship: Relationship, ownerTitle: string): string {
  const milestones = relationship.milestones
    .slice(-4)
    .map((m) => `${m.date} ${m.text}`)
    .join("；");
  return `认识第 ${relationship.daysKnown ?? 1} 天。信任 ${Math.round(relationship.trust)}/100，亲密 ${Math.round(relationship.intimacy)}/100。${milestones ? `记得：${milestones}。` : ""}`;
}

export function relationshipGrowth(relationship: Relationship): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  out.push({ label: "认识", text: `第 ${relationship.daysKnown ?? 1} 天` });
  out.push({ label: "连续说话", text: `${relationship.streak} 天` });
  out.push({ label: "信任", text: `${Math.round(relationship.trust)} / 100` });
  out.push({ label: "亲密", text: `${Math.round(relationship.intimacy)} / 100` });
  return out;
}

export function stamp(): string {
  return formatClock();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
