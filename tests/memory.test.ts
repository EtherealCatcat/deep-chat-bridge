import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, ensureLayout, paths } from "../src/config.js";
import { MemoryStore } from "../src/memory.js";

const config = structuredClone(DEFAULT_CONFIG);
const roots: string[] = [];

function tempStore(): MemoryStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chatbridge-test-"));
  roots.push(root);
  const p = paths(root);
  ensureLayout(p);
  const store = new MemoryStore(p, config);
  store.ensure();
  return store;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("memory", () => {
  it("seeds core memory and appends inbox notes", () => {
    const store = tempStore();
    expect(store.readCore().owner).toContain("关于主人");
    store.appendInbox("主人喜欢下雨天", "owner");
    expect(store.recentInbox(3).join("\n")).toContain("下雨天");
  });

  it("recalls notes by keyword", () => {
    const store = tempStore();
    store.appendTopic("工作", "换了一个新项目，压力有点大。");
    const hits = store.recall("项目 压力", 3);
    expect(hits.join("\n")).toContain("新项目");
  });

  it("archives forgotten lines instead of losing them", () => {
    const store = tempStore();
    store.appendInbox("临时记一下：周三交报告", "owner");
    store.forget("周三交报告");
    expect(store.recentInbox(3).join("\n")).not.toContain("周三交报告");
  });
});
