import fs from "node:fs";
import path from "node:path";
import type { Paths } from "./config.js";
import type { Sticker } from "./types.js";
import { readJson, writeJson, listFiles } from "./store.js";

const BUILTIN: Sticker[] = [
  { name: "开心", emoji: "😊", desc: "弯着眼睛笑", scene: "开心、被夸", addedAt: 0 },
  { name: "好耶", emoji: "🎉", desc: "小小的庆祝", scene: "好消息", addedAt: 0 },
  { name: "难过", emoji: "🥺", desc: "眼睛湿漉漉的", scene: "委屈、难过", addedAt: 0 },
  { name: "困", emoji: "😴", desc: "眼皮快合上了", scene: "困、想睡", addedAt: 0 },
  { name: "无语", emoji: "😑", desc: "一时不知道说什么", scene: "无语、被逗到", addedAt: 0 },
  { name: "贴贴", emoji: "🫂", desc: "想靠近一点", scene: "想念、安慰", addedAt: 0 },
  { name: "生气", emoji: "😤", desc: "鼓着脸", scene: "吃醋、被惹到", addedAt: 0 },
  { name: "问号", emoji: "❓", desc: "缓缓打出一个问号", scene: "没听懂", addedAt: 0 },
  { name: "害羞", emoji: "😳", desc: "耳朵有点红", scene: "被夸、不好意思", addedAt: 0 },
  { name: "哼", emoji: "😾", desc: "嘴硬", scene: "闹小脾气", addedAt: 0 },
];

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
  const marker = path.join(p.stickers, ".pack-v1");
  const dir = packDir();
  if (fs.existsSync(marker) || !fs.existsSync(path.join(dir, "pack.json"))) return existing;
  const pack = readJson<StickerPack>(path.join(dir, "pack.json"), {});
  const items = pack.items ?? [];
  if (!items.length) return existing;
  const next = existing.slice();
  for (const item of items) {
    const src = path.join(dir, item.file);
    const dest = path.join(p.stickers, item.file);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
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
  fs.writeFileSync(marker, "1\n");
  return next;
}

export function ensureStickers(p: Paths): Sticker[] {
  const file = indexFile(p);
  let existing = readJson<Sticker[]>(file, []);
  if (!existing.length) {
    existing = BUILTIN;
    writeJson(file, existing);
  }
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
