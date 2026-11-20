import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ default: { lookup } }));

import {
  isAllowedOrigin,
  isLoopbackHostname,
  isLoopbackOrigin,
  isRequestOriginAllowed,
  isSameLocalService,
} from "../src/security.js";
import { WebError, assertSafeUrl } from "../src/web.js";

const answer = (address: string, family: number) => ({ address, family });

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

beforeEach(() => {
  lookup.mockReset();
});

describe("local API origin policy", () => {
  it("allows only the dev server and Tauri webview origins", () => {
    expect(isAllowedOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("tauri://localhost")).toBe(true);
    expect(isAllowedOrigin("http://tauri.localhost")).toBe(true);
    expect(isAllowedOrigin("https://tauri.localhost")).toBe(true);

    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:5174")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:5173.evil.example")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
    expect(isAllowedOrigin("file:///tmp/page.html")).toBe(false);
  });

  it("recognises loopback hosts, including bracketed IPv6 and trailing dots", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname("localhost.")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);

    expect(isLoopbackHostname("127.0.0.1.evil.example")).toBe(false);
    expect(isLoopbackHostname("evil.example")).toBe(false);
    expect(isLoopbackHostname("127.0.0.2")).toBe(false);
  });

  it("treats localhost and 127.0.0.1 on the same port as one service", () => {
    expect(isSameLocalService("http://localhost:7788", "127.0.0.1:7788")).toBe(true);
    expect(isSameLocalService("http://127.0.0.1:7788", "localhost:7788")).toBe(true);
    expect(isSameLocalService("http://127.0.0.1:7788", "127.0.0.1:7788")).toBe(true);
    expect(isSameLocalService("http://[::1]:7788", "[::1]:7788")).toBe(true);

    expect(isSameLocalService("http://localhost:7789", "127.0.0.1:7788")).toBe(false);
    expect(isSameLocalService("https://localhost:7788", "127.0.0.1:7788")).toBe(false);
    expect(isSameLocalService("http://evil.example:7788", "127.0.0.1:7788")).toBe(false);
  });

  it("allows local loopback pages but blocks foreign origins and hosts", () => {
    expect(isRequestOriginAllowed(undefined, "127.0.0.1:7788")).toBe(true);
    expect(isRequestOriginAllowed("http://127.0.0.1:7788", "127.0.0.1:7788")).toBe(true);
    expect(isRequestOriginAllowed("http://localhost:7788", "127.0.0.1:7788")).toBe(true);
    expect(isRequestOriginAllowed("tauri://localhost", "127.0.0.1:7788")).toBe(true);
    expect(isRequestOriginAllowed("http://127.0.0.1:5173", "127.0.0.1:7788")).toBe(true);

    expect(isRequestOriginAllowed("https://evil.example", "127.0.0.1:7788")).toBe(false);
    expect(isRequestOriginAllowed("http://127.0.0.1:9999", "127.0.0.1:7788")).toBe(false);
    expect(isRequestOriginAllowed(undefined, "evil.example:7788")).toBe(false);
    expect(isRequestOriginAllowed(undefined, undefined)).toBe(false);
    expect(isRequestOriginAllowed(undefined, "127.0.0.1:7788/extra")).toBe(false);
  });

  it("does not mistake a public page for a loopback origin", () => {
    expect(isLoopbackOrigin("http://127.0.0.1:9000")).toBe(true);
    expect(isLoopbackOrigin("https://[::1]:7788")).toBe(true);
    expect(isLoopbackOrigin("http://127.0.0.1.evil.example")).toBe(false);
    expect(isLoopbackOrigin("tauri://localhost")).toBe(false);
    expect(isLoopbackOrigin("null")).toBe(false);
  });
});

describe("web DNS safety with a local proxy", () => {
  it("allows Clash fake-ip answers (IPv4 + IPv6 at once)", async () => {
    lookup.mockResolvedValue([answer("198.18.0.42", 4), answer("fdfe:dcba:9876::1b3", 6)]);
    await expect(assertSafeUrl("https://example.com/article")).resolves.toBeInstanceOf(URL);
  });

  it("keeps the public path when a private answer is mixed in", async () => {
    lookup.mockResolvedValue([answer("203.0.113.9", 4), answer("127.0.0.1", 4)]);
    await expect(assertSafeUrl("https://example.com")).resolves.toBeInstanceOf(URL);
  });

  it("still rejects a host that only resolves to internal addresses", async () => {
    lookup.mockResolvedValue([answer("10.0.0.5", 4)]);
    const error = await assertSafeUrl("https://intranet.example").catch((e) => e);
    expect(error).toBeInstanceOf(WebError);
    expect(messageOf(error)).toContain("本机/内网");
  });

  it("rejects internal literals and .local without touching DNS", async () => {
    for (const url of [
      "http://[fd00::1]/",
      "http://127.0.0.1:7788/",
      "http://10.0.0.5/",
      "http://[::1]/",
      "http://localhost/",
      "http://printer.local/",
    ]) {
      const error = await assertSafeUrl(url).catch((e) => e);
      expect(messageOf(error)).toContain("本机/内网");
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("tells DNS failures apart from private addresses", async () => {
    lookup.mockRejectedValue(Object.assign(new Error("queryA ENOTFOUND"), { code: "ENOTFOUND" }));
    const error = await assertSafeUrl("https://nope.example").catch((e) => e);
    expect(error).toBeInstanceOf(WebError);
    expect(messageOf(error)).toContain("没解析出来");
    expect(messageOf(error)).not.toContain("本机/内网");
  });
});
