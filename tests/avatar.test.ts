import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarFile, avatarInfo, clearAvatar, saveAvatar } from "../src/avatar.js";
import { paths } from "../src/config.js";

const roots: string[] = [];

function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatbridge-avatar-"));
  roots.push(root);
  const p = paths(root);
  fs.mkdirSync(p.media, { recursive: true });
  return p;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";

describe("avatar storage", () => {
  it("stores a custom avatar and resolves its mime", () => {
    const p = tempPaths();
    const info = saveAvatar(p, PNG);
    expect(info.custom).toBe(true);
    expect(info.url).toContain("/api/avatar?v=");
    expect(avatarFile(p)?.mime).toBe("image/png");
  });

  it("removes the old file when replacing and resets to default", () => {
    const p = tempPaths();
    saveAvatar(p, PNG);
    const first = avatarFile(p)?.file;
    saveAvatar(p, PNG);
    const second = avatarFile(p)?.file;
    expect(second).not.toBe(first);
    expect(first && fs.existsSync(first)).toBe(false);

    const info = clearAvatar(p);
    expect(info.custom).toBe(false);
    expect(info.url).toBe("/avatar.png");
    expect(avatarFile(p)).toBeNull();
  });

  it("keeps versions unique when two saves share a millisecond", () => {
    const p = tempPaths();
    const spy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      saveAvatar(p, PNG);
      const first = avatarFile(p)?.file;
      const firstVersion = avatarInfo(p).updatedAt;
      saveAvatar(p, PNG);
      const second = avatarFile(p)?.file;
      expect(second).not.toBe(first);
      expect(avatarInfo(p).updatedAt).toBeGreaterThan(firstVersion);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects non-images", () => {
    const p = tempPaths();
    expect(() => saveAvatar(p, "data:image/png;base64,aGVsbG8=")).toThrow();
  });
});
