import { describe, expect, it } from "vitest";
import { holidayName, isHoliday, isMakeupWorkday, isWorkday } from "../src/holidays.js";

describe("Chinese holiday calendar", () => {
  it("knows the 2026 national day block", () => {
    expect(isHoliday("2026-10-01")).toBe(true);
    expect(holidayName("2026-10-01")).toContain("国庆");
  });

  it("knows make-up workdays", () => {
    expect(isMakeupWorkday("2026-10-10")).toBe(true);
    expect(isWorkday("2026-10-10")).toBe(true);
  });

  it("treats ordinary weekends as rest days", () => {
    expect(isWorkday("2026-11-21")).toBe(false);
    expect(isWorkday("2026-11-18")).toBe(true);
  });
});
