import { describe, expect, it } from "vitest";
import { assetUrl } from "../web/src/api.js";

describe("assetUrl", () => {
  it("resolves server API paths against the current API base", () => {
    expect(assetUrl("/api/avatar?v=1795199603520")).toBe(
      "http://127.0.0.1:7788/api/avatar?v=1795199603520",
    );
  });

  it("leaves frontend static assets relative to the page", () => {
    expect(assetUrl("/avatar.png")).toBe("/avatar.png");
  });

  it("leaves absolute, data and blob URLs untouched", () => {
    expect(assetUrl("https://example.com/avatar.png")).toBe("https://example.com/avatar.png");
    expect(assetUrl("http://127.0.0.1:7799/api/avatar?v=1")).toBe("http://127.0.0.1:7799/api/avatar?v=1");
    expect(assetUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(assetUrl("blob:http://127.0.0.1/abc")).toBe("blob:http://127.0.0.1/abc");
  });

  it("handles empty input", () => {
    expect(assetUrl("")).toBe("");
  });
});
