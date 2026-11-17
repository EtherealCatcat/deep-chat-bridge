import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { parseDue } from "../src/care.js";

const config = structuredClone(DEFAULT_CONFIG);
const now = new Date("2026-11-18T02:00:00+08:00").getTime();

describe("reminder parsing", () => {
  it("parses tomorrow morning", () => {
    const due = parseDue("明天 09:00", config, now);
    expect(due).toBe(new Date("2026-11-19T09:00:00+08:00").getTime());
  });

  it("parses relative minutes", () => {
    expect(parseDue("30 分钟后", config, now)).toBe(now + 30 * 60_000);
  });

  it("parses tonight", () => {
    expect(parseDue("今晚 22:30", config, now)).toBe(new Date("2026-11-18T22:30:00+08:00").getTime());
  });

  it("returns null for nonsense", () => {
    expect(parseDue("等我想想", config, now)).toBeNull();
  });
});
