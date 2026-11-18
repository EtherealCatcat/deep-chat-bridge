import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const out = path.join(root, "src-tauri", "resources");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "server.ts")],
  outfile: path.join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  minify: false,
  logLevel: "info",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "arm64" : process.arch;
const nodeOut = path.join(out, "node");
try {
  execFileSync("lipo", ["-thin", arch, process.execPath, "-output", nodeOut], { stdio: "ignore" });
} catch {
  fs.copyFileSync(process.execPath, nodeOut);
}
fs.chmodSync(nodeOut, 0o755);
try {
  execFileSync("codesign", ["--force", "--sign", "-", nodeOut], { stdio: "ignore" });
} catch {
  // 没有 codesign 时仍可本地运行；分发时由 Tauri 统一处理。
}

fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });
console.log(`P5 resources ready: ${out}`);
console.log(`  node: ${(fs.statSync(nodeOut).size / 1024 / 1024).toFixed(1)} MB`);
