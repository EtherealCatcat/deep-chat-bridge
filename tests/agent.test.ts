import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, ensureLayout, paths } from "../src/config.js";
import { ChatAgent } from "../src/agent.js";
import type { MemoryStore } from "../src/memory.js";

const config = structuredClone(DEFAULT_CONFIG);

function makeAgent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deephome-agent-"));
  const p = paths(root);
  ensureLayout(p);
  const agent = new ChatAgent(
    { config, paths: p, memory: null as unknown as MemoryStore, persona: "" },
    () => {},
    () => {},
  );
  return { agent, root };
}

describe("burst hold", () => {
  it("drops the messages collected during the burst on cancel", () => {
    const { agent, root } = makeAgent();
    try {
      agent.setHold(true);
      expect(agent.isHolding()).toBe(true);
      expect(agent.burstStartedAt).toBeGreaterThan(0);

      agent.enqueue("连发一");
      agent.enqueue("连发二");
      expect(agent.pendingCount).toBe(2);

      expect(agent.cancelHold()).toBe(2);
      expect(agent.pendingCount).toBe(0);
      expect(agent.isHolding()).toBe(false);
      expect(agent.burstStartedAt).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps messages that were already pending before the burst", () => {
    vi.useFakeTimers();
    const { agent, root } = makeAgent();
    try {
      agent.enqueue("更早的一条", Date.now() - 10);
      expect(agent.pendingCount).toBe(1);

      agent.setHold(true);
      agent.enqueue("连发中");
      expect(agent.pendingCount).toBe(2);

      // 只收回连发开始之后的；开始之前那条仍在，等常规防抖发出去。
      expect(agent.cancelHold()).toBe(1);
      expect(agent.pendingCount).toBe(1);
    } finally {
      agent.stop();
      vi.useRealTimers();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
