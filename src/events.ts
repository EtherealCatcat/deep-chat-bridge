import type { ChatMessage, MoodState, Relationship, RoomState, TimelineEvent, UsageDay } from "./types.js";
import type { CostPolicy } from "./pricing.js";
import type { Phase } from "./rhythm.js";

export interface StatusSnapshot {
  name: string;
  ownerTitle: string;
  busy: boolean;
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
}

export type ServerEvent =
  | { type: "status"; status: StatusSnapshot }
  | { type: "message"; message: ChatMessage }
  | { type: "typing"; on: boolean }
  | { type: "read"; at: number }
  | { type: "mood"; mood: MoodState }
  | { type: "timeline"; event: TimelineEvent }
  | { type: "busy"; busy: boolean }
  | { type: "error"; message: string }
  | { type: "done"; turnId: string }
  | { type: "diary"; day: string };
