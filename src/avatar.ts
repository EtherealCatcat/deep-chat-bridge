import fs from "node:fs";
import path from "node:path";
import type { Paths } from "./config.js";
import { readJson, writeJson } from "./store.js";

interface AvatarMeta {
  file: string;
  mime: string;
  updatedAt: number;
}

export interface AvatarInfo {
  custom: boolean;
  url: string;
  updatedAt: number;
  mime?: string;
}

const META = "avatar.json";
const DEFAULT_URL = "/avatar.png";
const MAX_BYTES = 4 * 1024 * 1024;

function metaFile(p: Paths): string {
  return path.join(p.media, META);
}

function readMeta(p: Paths): AvatarMeta | null {
  const meta = readJson<AvatarMeta | null>(metaFile(p), null);
  if (!meta?.file || !meta.mime) return null;
  if (!fs.existsSync(path.join(p.media, meta.file))) return null;
  return meta;
}

function detectMime(data: Buffer): string | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (data.length >= 6 && data.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}

export function avatarInfo(p: Paths): AvatarInfo {
  const meta = readMeta(p);
  if (!meta) return { custom: false, url: DEFAULT_URL, updatedAt: 0 };
  return {
    custom: true,
    url: `/api/avatar?v=${meta.updatedAt}`,
    updatedAt: meta.updatedAt,
    mime: meta.mime,
  };
}

export function avatarFile(p: Paths): { file: string; mime: string } | null {
  const meta = readMeta(p);
  return meta ? { file: path.join(p.media, meta.file), mime: meta.mime } : null;
}

export function saveAvatar(p: Paths, dataUrl: string): AvatarInfo {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("只支持 PNG、JPEG、WebP 或 GIF 图片。");
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("这张图片是空的。");
  if (data.length > MAX_BYTES) throw new Error("头像不要超过 4MB。");
  const mime = detectMime(data);
  if (!mime) throw new Error("看起来不是有效的图片文件。");

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  // Two saves can land in the same millisecond (fast disks, CI runners). Keep
  // the version strictly increasing so the filename changes and the `?v=`
  // cache buster does too.
  const previous = readMeta(p);
  const now = Date.now();
  const updatedAt = previous && now <= previous.updatedAt ? previous.updatedAt + 1 : now;
  const file = `avatar-${updatedAt}.${ext}`;
  fs.writeFileSync(path.join(p.media, file), data, { mode: 0o600 });
  writeJson(metaFile(p), { file, mime, updatedAt } satisfies AvatarMeta);

  // 新头像和元信息落盘后再清理旧文件，避免写到一半把原头像弄丢。
  for (const name of fs.readdirSync(p.media)) {
    if (name === file || name === META) continue;
    if (!name.startsWith("avatar-")) continue;
    try {
      fs.rmSync(path.join(p.media, name), { force: true });
    } catch {
      // ignore old files
    }
  }
  return avatarInfo(p);
}

export function clearAvatar(p: Paths): AvatarInfo {
  for (const name of fs.readdirSync(p.media)) {
    if (name.startsWith("avatar-") || name === META) {
      try {
        fs.rmSync(path.join(p.media, name), { force: true });
      } catch {
        // ignore
      }
    }
  }
  return avatarInfo(p);
}
