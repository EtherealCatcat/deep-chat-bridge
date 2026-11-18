import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ensureLayout, paths } from "../src/config.js";
import { ensureStickers, findSticker, stickerFile, stickerPrompt } from "../src/stickers.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatbridge-stickers-"));
const p = paths(root);
ensureLayout(p);

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("sticker pack", () => {
  it("merges the bundled pack into the data directory on first run", () => {
    const all = ensureStickers(p);
    const hello = all.find((s) => s.name === "打招呼");
    expect(hello?.file).toBe("hello.webp");
    expect(fs.existsSync(path.join(p.stickers, "hello.webp"))).toBe(true);
    expect(stickerFile(p, "hello.webp")).not.toBeNull();
  });

  it("keeps the built-in emoji stickers", () => {
    const all = ensureStickers(p);
    expect(all.some((s) => s.name === "开心")).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(28);
  });

  it("finds stickers by name and exposes them to the prompt", () => {
    expect(findSticker(p, "困困鱼")?.file).toBe("sleepy.webp");
    expect(findSticker(p, "无语鱼")?.file).toBe("speechless.webp");
    expect(stickerPrompt(p)).toContain("打招呼");
  });

  it("ships all pack files referenced by pack.json", () => {
    const dir = path.join(process.cwd(), "assets", "stickers");
    const pack = JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8")) as {
      items: { file: string }[];
    };
    expect(pack.items).toHaveLength(18);
    for (const item of pack.items) {
      expect(fs.existsSync(path.join(dir, item.file))).toBe(true);
    }
  });
});
