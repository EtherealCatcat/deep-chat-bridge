import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { quoteLine, toLLMHistory } from "../src/chat.js";
import type { ChatMessage } from "../src/types.js";

const config = structuredClone(DEFAULT_CONFIG);
const quote = {
  id: "u1",
  role: "user" as const,
  kind: "text" as const,
  text: "今天有点累",
  ts: new Date("2026-11-18T09:30:00+08:00").getTime(),
};

describe("quoted messages", () => {
  it("renders a quote line with the owner title and time", () => {
    const line = quoteLine(quote, config);
    expect(line).toContain("（引用 主人");
    expect(line).toContain("09:30");
    expect(line).toContain("今天有点累");
  });

  it("renders image and sticker references compactly", () => {
    const imageQuote = { ...quote, kind: "image" as const, text: "看看这个" };
    expect(quoteLine(imageQuote, config)).toContain("[图片]");
    const messages: ChatMessage[] = [
      {
        id: "i1",
        ts: quote.ts,
        role: "user",
        kind: "image",
        text: "看看这个",
        meta: { file: "inbox-1.png" },
        dayKey: "2026-11-18",
      },
      {
        id: "s1",
        ts: quote.ts + 1000,
        role: "assistant",
        kind: "sticker",
        text: "打招呼",
        meta: { file: "hello.webp" },
        dayKey: "2026-11-18",
      },
    ];
    const history = toLLMHistory(messages, 10, config);
    expect(history[0].content).toContain("[图片：看看这个]");
    expect(history[1].content).toContain("[表情:打招呼]");
  });

  it("prepends quote lines to LLM history", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        ts: quote.ts,
        role: "user",
        kind: "text",
        text: "今天有点累",
        dayKey: "2026-11-18",
      },
      {
        id: "a1",
        ts: quote.ts + 1000,
        role: "assistant",
        kind: "text",
        text: "那先歇一会儿。",
        dayKey: "2026-11-18",
        quote,
      },
    ];
    const history = toLLMHistory(messages, 10, config);
    expect(history[1].content).toContain("（引用 主人 09:30：今天有点累）");
    expect(history[1].content).toContain("那先歇一会儿。");
  });
});
