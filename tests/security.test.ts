import { describe, expect, it } from "vitest";
import {
  isAllowedOrigin,
  isLoopbackHostname,
  isLoopbackOrigin,
  isRequestOriginAllowed,
  isSameLocalService,
} from "../src/security.js";

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
