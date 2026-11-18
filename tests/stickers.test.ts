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
  it("merges the 100 static image stickers on first run", () => {
    const all = ensureStickers(p);
    expect(all).toHaveLength(100);
    expect(all.every((s) => Boolean(s.file))).toBe(true);
    const first = all.find((s) => s.name === "不服气");
    expect(first?.file).toBe("001-不服气.webp");
    expect(fs.existsSync(path.join(p.stickers, "001-不服气.webp"))).toBe(true);
    expect(stickerFile(p, "001-不服气.webp")).not.toBeNull();
  });

  it("replaces old v1 image stickers and emoji with the static pack", () => {
    const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chatbridge-stickers-migrate-"));
    const second = paths(secondRoot);
    ensureLayout(second);
    fs.writeFileSync(path.join(second.stickers, "hello.webp"), "old");
    fs.writeFileSync(
      path.join(second.stickers, "index.json"),
      JSON.stringify([
        { name: "打招呼", file: "hello.webp", desc: "old", scene: "old", addedAt: 0 },
        { name: "开心", emoji: "😊", desc: "old emoji", scene: "old", addedAt: 0 },
      ]),
    );
    fs.writeFileSync(path.join(second.stickers, ".pack-v1"), "1\n");

    const all = ensureStickers(second);
    expect(all).toHaveLength(100);
    expect(all.some((s) => s.name === "打招呼")).toBe(false);
    expect(all.some((s) => s.name === "开心" && s.file === "002-开心.webp")).toBe(true);
    expect(fs.existsSync(path.join(second.stickers, "hello.webp"))).toBe(false);
    fs.rmSync(secondRoot, { recursive: true, force: true });
  });

  it("finds stickers by name and exposes them to the prompt", () => {
    expect(findSticker(p, "不服气")?.file).toBe("001-不服气.webp");
    expect(findSticker(p, "无语")?.file).toBe("006-无语.webp");
    expect(stickerPrompt(p)).toContain("不服气");
  });

  it("ships all pack files referenced by pack.json", () => {
    const dir = path.join(process.cwd(), "assets", "stickers");
    const pack = JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8")) as {
      items: { file: string }[];
    };
    expect(pack.items).toHaveLength(100);
    for (const item of pack.items) {
      expect(fs.existsSync(path.join(dir, item.file))).toBe(true);
    }
  });
});
