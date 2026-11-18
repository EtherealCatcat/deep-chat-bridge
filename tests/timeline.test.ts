import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { groupTimelineEvents } from "../src/timeline.js";
import type { TimelineEvent } from "../src/types.js";

const config = structuredClone(DEFAULT_CONFIG);
const at = (minute: number) => new Date(`2026-11-18T${String(10 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+08:00`).getTime();

function event(minute: number, kind: string, text: string, meta?: Record<string, unknown>): TimelineEvent {
  return { ts: at(minute), kind, text, meta };
}

describe("timeline display grouping", () => {
  it("hides diagnostic resume gaps", () => {
    const events = [event(0, "resume_gap", "电脑睡了 46 分钟"), event(5, "room", "在发呆")];
    expect(groupTimelineEvents(events, config).map((item) => item.kind)).toEqual(["room"]);
  });

  it("merges consecutive chat turns into one fixed-period summary", () => {
    const events = [
      event(0, "chat", "和主人聊了 2 字", { chars: 2 }),
      event(7, "chat", "和主人聊了 3 字", { chars: 3 }),
      event(19, "room", "泡了杯茶"),
    ];
    const result = groupTimelineEvents(events, config);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("chat");
    expect(result[0].text).toContain("2 轮");
    expect(result[0].text).toContain("5 字");
    expect(result[1].kind).toBe("room");
  });

  it("starts a new chat summary after a long silence", () => {
    const events = [
      event(0, "chat", "和主人聊了 2 字", { chars: 2 }),
      event(10, "chat", "和主人聊了 3 字", { chars: 3 }),
      event(50, "chat", "和主人聊了 4 字", { chars: 4 }),
    ];
    const result = groupTimelineEvents(events, config);
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain("2 轮");
    expect(result[1].text).toContain("1 轮");
  });

  it("normalizes a single chat event and falls back to text length", () => {
    const events = [event(0, "chat", "和主人聊了 12 字")];
    const result = groupTimelineEvents(events, config);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("和主人聊了 1 轮，约 12 字");
  });
});
