import fs from "node:fs";
import path from "node:path";
import type { Paths } from "./config.js";
import type { Sticker } from "./types.js";
import { readJson, writeJson, listFiles } from "./store.js";

const OLD_PACK_FILES = new Set([
  "hello.webp", "happy.webp", "wink.webp", "shy.webp", "pout.webp",
  "angry.webp", "sad.webp", "wronged.webp", "sleepy.webp", "confused.webp",
  "speechless.webp", "proud.webp", "shock.webp", "eat.webp", "slack.webp",
  "cheer.webp", "no.webp", "heart.webp",
]);

interface StickerPack {
  name?: string;
  attribution?: string;
  items?: { name: string; file: string; desc?: string; scene?: string }[];
}

function indexFile(p: Paths): string {
  return path.join(p.stickers, "index.json");
}

function packDir(): string {
  return path.join(process.cwd(), "assets", "stickers");
}

function mergePack(p: Paths, existing: Sticker[]): Sticker[] {
  const marker = path.join(p.stickers, ".pack-v2");
  const dir = packDir();
  if (fs.existsSync(marker) || !fs.existsSync(path.join(dir, "pack.json"))) return existing;
  const pack = readJson<StickerPack>(path.join(dir, "pack.json"), {});
  const items = pack.items ?? [];
  if (!items.length) return existing;

  // v2 replaces the old v1 image pack and the built-in emoji set. Keep
  // stickers the owner added by hand (addedAt != 0 and backed by a file).
  const next = existing.filter((s) => s.addedAt !== 0 && Boolean(s.file));

  for (const item of items) {
    const src = path.join(dir, item.file);
    const dest = path.join(p.stickers, item.file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dest);
      } catch {
        continue;
      }
    }
    if (!next.some((s) => s.name === item.name)) {
      next.push({
        name: item.name,
        file: item.file,
        desc: item.desc,
        scene: item.scene,
        addedAt: 0,
      });
    }
  }

  writeJson(indexFile(p), next);
  fs.writeFileSync(marker, "2\n");
  try {
    fs.unlinkSync(path.join(p.stickers, ".pack-v1"));
  } catch {
    // no v1 marker
  }
  for (const old of OLD_PACK_FILES) {
    if (next.some((s) => s.file === old)) continue;
    try {
      fs.unlinkSync(path.join(p.stickers, old));
    } catch {
      // already gone
    }
  }
  return next;
}

export function ensureStickers(p: Paths): Sticker[] {
  const existing = readJson<Sticker[]>(indexFile(p), []);
  return mergePack(p, existing);
}

export function listStickers(p: Paths): Sticker[] {
  return ensureStickers(p).sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

export function findSticker(p: Paths, name: string): Sticker | null {
  const clean = name.trim().replace(/^\[表情[:：]?|\]$/g, "");
  const all = listStickers(p);
  return (
    all.find((s) => s.name === clean) ??
    all.find((s) => s.name.includes(clean) || clean.includes(s.name)) ??
    all.find((s) => (s.desc ?? "").includes(clean) || (s.scene ?? "").includes(clean)) ??
    null
  );
}

export function stickerPrompt(p: Paths): string {
  const all = listStickers(p);
  return all.map((s) => `${s.name}（${s.scene ?? s.desc ?? "随手发的"}）`).join("、");
}

export function addSticker(p: Paths, input: { name: string; emoji?: string; desc?: string; scene?: string; file?: string }): Sticker {
  const all = ensureStickers(p);
  const sticker: Sticker = {
    name: input.name.trim().slice(0, 20),
    emoji: input.emoji?.slice(0, 8),
    desc: input.desc?.slice(0, 80),
    scene: input.scene?.slice(0, 80),
    file: input.file,
    addedAt: Date.now(),
  };
  const next = all.filter((s) => s.name !== sticker.name).concat(sticker);
  writeJson(indexFile(p), next);
  return sticker;
}

export function removeSticker(p: Paths, name: string): boolean {
  const all = ensureStickers(p);
  const next = all.filter((s) => s.name !== name);
  if (next.length === all.length) return false;
  writeJson(indexFile(p), next);
  return true;
}

export function stickerFile(p: Paths, file: string): string | null {
  const base = path.basename(file);
  const candidate = path.join(p.stickers, base);
  if (fs.existsSync(candidate)) return candidate;
  const files = listFiles(p.stickers).filter((f) => path.basename(f) === base);
  return files[0] ?? null;
}
