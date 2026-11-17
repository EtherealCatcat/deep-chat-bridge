import { describe, expect, it } from "vitest";
import { addDays, dayKey, parseClock, weekdayCN } from "../src/time.js";

describe("logical day", () => {
  it("rolls over at 05:00 in Asia/Shanghai", () => {
    expect(dayKey(new Date("2026-11-18T02:00:00+08:00").getTime())).toBe("2026-11-17");
    expect(dayKey(new Date("2026-11-18T05:00:00+08:00").getTime())).toBe("2026-11-18");
  });

  it("adds days without timezone drift", () => {
    expect(addDays("2026-11-17", 1)).toBe("2026-11-18");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formats weekdays and clock strings", () => {
    expect(weekdayCN("2026-11-18")).toContain("三");
    expect(parseClock("23:05")).toEqual({ hour: 23, minute: 5 });
    expect(parseClock("25:00")).toBeNull();
  });
});
