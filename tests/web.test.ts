import { describe, expect, it } from "vitest";
import { WebError, assertSafeUrl, fetchText, type FetchLike } from "../src/web.js";

const passthrough = async (raw: string): Promise<URL> => new URL(raw);

/** Stand-in for the real guard, without touching DNS. */
const rejectLoopback = async (raw: string): Promise<URL> => {
  const url = new URL(raw);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    throw new WebError("这个地址不让看。");
  }
  return url;
};

describe("web fetch safety", () => {
  it("rejects file URLs and private targets before fetching", async () => {
    for (const url of [
      "file:///etc/passwd",
      "http://127.0.0.1:7788/api/memory",
      "http://localhost:7788/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
    ]) {
      await expect(assertSafeUrl(url)).rejects.toBeInstanceOf(WebError);
    }
  });

  it("revalidates every redirect hop instead of following it blindly", async () => {
    const requested: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      requested.push(url.toString());
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
    };

    await expect(
      fetchText("https://example.com/start", { fetchImpl, assertUrl: rejectLoopback }),
    ).rejects.toThrow("这个地址不让看。");
    // The loopback target must never be requested.
    expect(requested).toEqual(["https://example.com/start"]);
  });

  it("resolves relative redirects against the current hop", async () => {
    const seen: string[] = [];
    let call = 0;
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url.toString());
      call += 1;
      if (call === 1) {
        return new Response(null, { status: 302, headers: { location: "/next?x=1" } });
      }
      return new Response("hello", { status: 200, headers: { "content-type": "text/plain" } });
    };

    const result = await fetchText("https://example.com/a/b", { fetchImpl, assertUrl: passthrough });
    expect(seen).toEqual(["https://example.com/a/b", "https://example.com/next?x=1"]);
    expect(result.finalUrl).toBe("https://example.com/next?x=1");
    expect(result.text).toBe("hello");
  });

  it("stops after too many redirects", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(null, { status: 302, headers: { location: "/loop" } });
    await expect(
      fetchText("https://example.com/", { fetchImpl, assertUrl: passthrough }),
    ).rejects.toThrow("跳转太多次");
  });

  it("reports a redirect without a location and non-ok responses", async () => {
    const noLocation: FetchLike = async () => new Response(null, { status: 302 });
    await expect(
      fetchText("https://example.com/", { fetchImpl: noLocation, assertUrl: passthrough }),
    ).rejects.toThrow("没给地址");

    const notFound: FetchLike = async () => new Response("nope", { status: 404 });
    await expect(
      fetchText("https://example.com/", { fetchImpl: notFound, assertUrl: passthrough }),
    ).rejects.toThrow("HTTP 404");
  });

  it("still refuses oversized bodies", async () => {
    const huge: FetchLike = async () =>
      new Response("x", { status: 200, headers: { "content-length": "3000000" } });
    await expect(
      fetchText("https://example.com/", { fetchImpl: huge, assertUrl: passthrough }),
    ).rejects.toThrow("太大了");
  });
});
