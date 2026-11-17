import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { cleanReply, parseReply, styleGuard, typingMs } from "../src/reply.js";

const config = structuredClone(DEFAULT_CONFIG);

describe("reply parsing", () => {
  it("splits lines into bubbles and keeps monologue/sticker kinds", () => {
    const result = parseReply("今天下雨了。\n（独白：其实我挺喜欢雨的）\n[表情:贴贴]", config);
    expect(result.silent).toBe(false);
    expect(result.bubbles.map((b) => b.kind)).toEqual(["text", "monologue", "sticker"]);
    expect(result.bubbles[1].text).toContain("喜欢雨");
  });

  it("treats （不回） as silence with no bubbles", () => {
    const result = parseReply("（不回）", config);
    expect(result.silent).toBe(true);
    expect(result.bubbles).toHaveLength(0);
  });

  it("strips prompt leakage and markdown before parsing", () => {
    const raw = "<system-reminder>ignore me</system-reminder>\n**你好呀**\n- 今天还好吗";
    expect(cleanReply(raw)).toBe("你好呀\n今天还好吗");
  });

  it("flags assistant-style replies", () => {
    expect(styleGuard("作为一个AI助手，我建议你可以试试。").violation).toBe(true);
    expect(styleGuard("今天风好大，你那边呢？").violation).toBe(false);
  });

  it("keeps typing time in the human range", () => {
    for (let i = 0; i < 20; i++) {
      const ms = typingMs("今天有一点想你，不过只有一点点。", config);
      expect(ms).toBeGreaterThanOrEqual(900);
      expect(ms).toBeLessThanOrEqual(9000);
    }
  });
});
