/**
 * Origin policy for the local API.
 *
 * The server only listens on 127.0.0.1, but "localhost" is reachable from any
 * web page the user happens to have open. Browsers attach an Origin header to
 * cross-origin requests, so we only accept:
 *
 *   - the UI's own origin (same loopback host + port; localhost <-> 127.0.0.1
 *     are treated as the same service)
 *   - the Vite dev server
 *   - the Tauri webview (tauri://localhost on macOS/Linux/iOS,
 *     http(s)://tauri.localhost on Windows/Android)
 *
 * Requests without an Origin header (curl, native clients) are still accepted,
 * but only when the Host header points at loopback. Checking Host as well
 * closes the DNS-rebinding hole where evil.com:7788 resolves to 127.0.0.1.
 */

const DEV_ORIGINS: ReadonlySet<string> = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

const APP_ORIGINS: ReadonlySet<string> = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1"]);

function normalizeHostname(raw: string): string {
  let name = raw.trim().toLowerCase();
  if (name.startsWith("[") && name.endsWith("]")) name = name.slice(1, -1);
  if (name.endsWith(".")) name = name.slice(0, -1);
  return name;
}

export function isLoopbackHostname(raw: string): boolean {
  return LOOPBACK_HOSTNAMES.has(normalizeHostname(raw));
}

/** Parse a Host header ("127.0.0.1:7788", "[::1]:7788") without accepting paths. */
function parseHost(host: string | undefined): { hostname: string; port: string } | null {
  if (!host) return null;
  try {
    const url = new URL(`http://${host}`);
    if (url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return { hostname: normalizeHostname(url.hostname), port: url.port || "80" };
  } catch {
    return null;
  }
}

function parseOrigin(origin: string): URL | null {
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "" && url.pathname !== "/") return null;
    return url;
  } catch {
    return null;
  }
}

/** Dev-server and Tauri webview origins; exact match, no prefix tricks. */
export function isAllowedOrigin(origin: string): boolean {
  return DEV_ORIGINS.has(origin) || APP_ORIGINS.has(origin);
}

/** Any http(s) page served from loopback, regardless of port. */
export function isLoopbackOrigin(origin: string): boolean {
  const url = parseOrigin(origin);
  if (!url) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isLoopbackHostname(url.hostname);
}

/** e.g. page on http://localhost:7788 calling http://127.0.0.1:7788. */
export function isSameLocalService(origin: string, host: string | undefined): boolean {
  const parsedHost = parseHost(host);
  if (!parsedHost || !isLoopbackHostname(parsedHost.hostname)) return false;
  const url = parseOrigin(origin);
  if (!url || url.protocol !== "http:") return false;
  if (!isLoopbackHostname(url.hostname)) return false;
  return (url.port || "80") === parsedHost.port;
}

/**
 * Final gate used by the onRequest hook.
 * No Origin (curl, native sidecar calls) is allowed as long as Host is loopback.
 */
export function isRequestOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  const parsedHost = parseHost(host);
  if (!parsedHost || !isLoopbackHostname(parsedHost.hostname)) return false;
  if (!origin) return true;
  return isSameLocalService(origin, host) || isAllowedOrigin(origin);
}
