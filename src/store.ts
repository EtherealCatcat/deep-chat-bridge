import fs from "node:fs";
import path from "node:path";
import type { Paths } from "./config.js";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(file: string): boolean {
  return fs.existsSync(file);
}

export function readText(file: string, fallback = ""): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
}

export function atomicWrite(file: string, content: string): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function writeText(file: string, content: string): void {
  atomicWrite(file, content);
}

export function appendText(file: string, content: string): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, content, "utf8");
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  atomicWrite(file, JSON.stringify(value, null, 2) + "\n");
}

export function appendJsonl(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + "\n", "utf8");
}

export function readJsonl<T>(file: string): T[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const out: T[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as T);
      } catch {
        // skip corrupt line, keep the rest readable
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function listFiles(dir: string, ext?: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (!ext || entry.name.endsWith(ext)))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function backupFile(p: Paths, file: string, label: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
  const target = path.join(p.backups, `${safe}-${stamp}.md`);
  ensureDir(p.backups);
  try {
    fs.copyFileSync(file, target);
  } catch {
    writeText(target, "");
  }
  const files = listFiles(p.backups, ".md");
  const excess = files.length - 30;
  if (excess > 0) {
    for (const old of files.slice(0, excess)) {
      try {
        fs.unlinkSync(old);
      } catch {
        // ignore
      }
    }
  }
  return target;
}

export function safeName(value: string, fallback = "untitled"): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || fallback;
}

export function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function removeFile(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore
  }
}
