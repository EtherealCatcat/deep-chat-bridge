import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./types.js";
import { dataRoot, deepMerge, ensureLayout, loadConfig, maskConfig, paths, saveConfig } from "./config.js";
import { MemoryStore } from "./memory.js";
import { ChatAgent } from "./agent.js";
import { Scheduler } from "./scheduler.js";
import { buildStatus } from "./status.js";
import { DEFAULT_PERSONA } from "./persona.js";
import { relationshipDescription, relationshipGrowth, updateStreak } from "./relationship.js";
import { appendChatMessage, recentMessages } from "./chat.js";
import { addReminder, cancelReminder, loadReminders, markReminderDone, parseDue } from "./care.js";
import { listDiaries, readDiary, yesterdayKey } from "./diaryStore.js";
import { writeDiary, diaryTarget } from "./diary.js";
import { consolidateMemory, hasInbox } from "./consolidate.js";
import { appendTimeline, readTimeline } from "./timeline.js";
import { loadDeferred, loadLife } from "./life.js";
import { todayUsage } from "./usage.js";
import { MODEL_PRICES, costPolicy, peakInfo } from "./pricing.js";
import { callLLM } from "./llm.js";
import { listStickers } from "./stickers.js";
import { backupFile, exists, readText, writeText } from "./store.js";
import { dayKey, formatClock, weekdayCN } from "./time.js";
import type { ServerEvent } from "./events.js";

const root = dataRoot();
const p = paths(root);
ensureLayout(p);

let config = loadConfig(p);
if (!exists(p.persona)) writeText(p.persona, DEFAULT_PERSONA);
let persona = readText(p.persona, DEFAULT_PERSONA).trim() || DEFAULT_PERSONA;

const memory = new MemoryStore(p, config);
memory.ensure();
updateStreak(p, config);

const app = Fastify({ logger: { level: "warn" }, bodyLimit: 2 * 1024 * 1024 });
await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] });

const clients = new Set<NodeJS.WritableStream & { write: (chunk: string) => boolean }>();
let unread = 0;

function emit(event: ServerEvent): void {
  if (event.type === "message" && event.message.role === "assistant" && clients.size === 0) {
    unread += 1;
  }
  broadcast(event);
}

function broadcast(event: ServerEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function currentStatus() {
  return buildStatus({ config, paths: p, busy: agent.busy, unread });
}

function onChange(): void {
  broadcast({ type: "status", status: currentStatus() });
}

const agent = new ChatAgent({ config, paths: p, memory, persona }, emit, onChange);
const scheduler = new Scheduler({ config, paths: p, memory, persona, agent, emit, onChange });

function refreshContext(): void {
  const next = { config, paths: p, memory, persona };
  agent.setContext(next);
  scheduler.setContext({ ...next, agent, emit, onChange });
}

function requireObject(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function paramDay(params: unknown): string {
  const day = String((params as { day?: string }).day ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
}

// ---------- status & realtime ----------

app.get("/api/health", async () => ({
  ok: true,
  name: config.name,
  version: "0.1.0",
  root,
  hasKey: Boolean(config.model.apiKey),
  time: Date.now(),
}));

app.get("/api/status", async () => currentStatus());

app.get("/api/events", async (request, reply) => {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  clients.add(res as unknown as NodeJS.WritableStream & { write: (chunk: string) => boolean });
  res.write(`retry: 3000\n\n`);
  res.write(`data: ${JSON.stringify({ type: "status", status: currentStatus() })}\n\n`);
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);
  request.raw.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res as unknown as NodeJS.WritableStream & { write: (chunk: string) => boolean });
  });
});

// ---------- chat ----------

app.get("/api/messages", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Math.max(1, Math.min(300, Number(query.limit) || 80));
  return { messages: recentMessages(p, config, limit) };
});

app.post("/api/messages", async (request, reply) => {
  const body = requireObject(request.body);
  const text = String(body.text ?? "").trim();
  if (!text) return reply.code(400).send({ error: "说点什么吧。" });
  if (text.length > 4000) return reply.code(413).send({ error: "太长了，分几次说。" });
  unread = 0;
  const message = appendChatMessage(p, config, { role: "user", kind: "text", text });
  updateStreak(p, config);
  emit({ type: "message", message });
  agent.enqueue(text);
  return { ok: true, message };
});

app.post("/api/read", async () => {
  unread = 0;
  return { ok: true };
});

app.post("/api/typing", async () => ({ ok: true }));

app.post("/api/reaction", async (request) => {
  const body = requireObject(request.body);
  const messageId = String(body.messageId ?? "");
  const reaction = String(body.reaction ?? "").slice(0, 20);
  const message = recentMessages(p, config, 300).find((m) => m.id === messageId);
  if (message && reaction) {
    appendTimeline(p, config, {
      kind: "reaction",
      text: `${reaction}了「${message.text.slice(0, 20)}」`,
      meta: { messageId, reaction },
    });
    emit({ type: "timeline", event: { ts: Date.now(), kind: "reaction", text: `${reaction}` } });
  }
  return { ok: true };
});

app.post("/api/stop", async () => {
  agent.stop();
  return { ok: true };
});

app.post("/api/new", async () => {
  agent.newSession();
  return { ok: true };
});

app.post("/api/command", async (request, reply) => {
  const body = requireObject(request.body);
  const command = String(body.command ?? "").trim();
  if (command === "/stop") {
    agent.stop();
    return { ok: true, text: "停下了。" };
  }
  if (command === "/new") {
    agent.newSession();
    return { ok: true, text: "好，重新开始。" };
  }
  if (command === "/status") {
    const s = currentStatus();
    return {
      ok: true,
      text: `${s.name} · ${s.rhythm.label} · ${s.moodLabel}\n在${s.activity}。今天聊了 ${s.todayMessages} 句，主动 ${s.proactiveToday} 次。`,
    };
  }
  if (command === "/diary") {
    const target = diaryTarget(config, loadLife(p).lastDiary, Date.now());
    if (!target) return { ok: true, text: "今天还没到写日记的时候。" };
    const ok = await writeDiary(target, { config, paths: p, memory, persona, emit, onChange });
    return { ok, text: ok ? `写好了 ${target} 的日记。` : "今天没有可写的，或者写失败了。" };
  }
  return reply.code(400).send({ error: "不认识这个命令。" });
});

// ---------- memory & persona ----------

app.get("/api/memory", async () => memory.snapshot());

app.put("/api/memory", async (request, reply) => {
  const body = requireObject(request.body);
  const name = String(body.name ?? "");
  const content = String(body.content ?? "");
  if (content.length > 20_000) return reply.code(413).send({ error: "这段记忆太长了。" });
  if (name === "owner" || name === "me" || name === "we") {
    memory.writeCore(name, content);
    onChange();
    return { ok: true };
  }
  if (name.startsWith("topic:")) {
    const title = name.slice(6).trim().replace(/[\\/:*?"<>|]/g, "-");
    if (!title) return reply.code(400).send({ error: "话题名不能为空。" });
    const file = memory.topicFile(title);
    if (readText(file)) backupFile(p, file, `topic-${title}`);
    writeText(file, content.trim() + "\n");
    onChange();
    return { ok: true };
  }
  return reply.code(400).send({ error: "不认识这份记忆。" });
});

app.get("/api/persona", async () => ({ persona, defaultPersona: DEFAULT_PERSONA }));

app.put("/api/persona", async (request, reply) => {
  const body = requireObject(request.body);
  const content = String(body.content ?? "").trim();
  if (content.length < 50) return reply.code(400).send({ error: "人设太短了，再写一点。" });
  if (content.length > 20_000) return reply.code(413).send({ error: "人设太长了。" });
  backupFile(p, p.persona, "persona");
  writeText(p.persona, content + "\n");
  persona = content;
  refreshContext();
  onChange();
  return { ok: true };
});

// ---------- diary, timeline, reminders ----------

app.get("/api/diary", async () => ({ diaries: listDiaries(p) }));

app.get("/api/diary/:day", async (request, reply) => {
  const day = paramDay(request.params);
  const content = readDiary(p, day);
  if (!content) return reply.code(404).send({ error: "这一天还没有日记。" });
  return { day, content };
});

app.post("/api/diary/write", async (request) => {
  const body = requireObject(request.body);
  const day = String(body.day ?? "") || yesterdayKey(config);
  const ok = await writeDiary(day, { config, paths: p, memory, persona, emit, onChange });
  return { ok };
});

app.get("/api/timeline", async (request) => {
  const query = request.query as { day?: string };
  const day = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone);
  return { day, events: readTimeline(p, day), heading: `${day} · ${weekdayCN(day)}` };
});

app.get("/api/reminders", async () => ({ reminders: loadReminders(p).filter((r) => r.status === "pending") }));

app.post("/api/reminders", async (request, reply) => {
  const body = requireObject(request.body);
  const text = String(body.text ?? "").trim();
  const due = String(body.due ?? "").trim();
  if (!text || !due) return reply.code(400).send({ error: "要写提醒内容和时间。" });
  const dueAt = parseDue(due, config);
  if (!dueAt) return reply.code(400).send({ error: "没看懂这个时间，试试「明天 09:00」。" });
  const reminder = addReminder(p, config, {
    text,
    dueAt,
    kind: body.kind === "care" ? "care" : "owner",
  });
  onChange();
  return { ok: true, reminder };
});

app.post("/api/reminders/:id/done", async (request) => {
  const id = String((request.params as { id?: string }).id ?? "");
  const reminder = markReminderDone(p, id);
  onChange();
  return { ok: Boolean(reminder) };
});

app.delete("/api/reminders/:id", async (request) => {
  const id = String((request.params as { id?: string }).id ?? "");
  const ok = cancelReminder(p, id);
  onChange();
  return { ok };
});

// ---------- relationship, usage, stickers, debug ----------

app.get("/api/relationship", async () => {
  const snapshot = currentStatus();
  return {
    relationship: snapshot.relationship,
    daysKnown: snapshot.relationship.daysKnown ?? 1,
    description: relationshipDescription(snapshot.relationship, config.ownerTitle),
    growth: relationshipGrowth(snapshot.relationship),
  };
});

app.get("/api/usage", async () => ({
  today: todayUsage(p, config),
  policy: costPolicy(config, todayUsage(p, config)),
  pricing: peakInfo(Date.now(), config.behavior.timezone),
  prices: MODEL_PRICES,
}));

app.get("/api/stickers", async () => ({ stickers: listStickers(p) }));

app.get("/api/debug", async () => ({
  status: currentStatus(),
  life: loadLife(p),
  deferred: loadDeferred(p),
  usage: todayUsage(p, config),
  timeline: readTimeline(p, dayKey(Date.now(), config.behavior.rotateHour, config.behavior.timezone)).slice(-20),
  lastTurn: agent.getDebug(),
  config: maskConfig(config),
}));

app.post("/api/debug/consolidate", async () => {
  const life = loadLife(p);
  if (!life.lastDiary) return { ok: false, error: "还没有日记可整理。" };
  const ok = await consolidateMemory(life.lastDiary, { config, paths: p, memory, emit, onChange });
  return { ok };
});

// ---------- settings ----------

app.post("/api/test-model", async (request) => {
  const body = requireObject(request.body);
  const patch = body.config && typeof body.config === "object" ? (body.config as Partial<AppConfig>) : {};
  const cfg = deepMerge<AppConfig>(config, patch);
  if (patch.model?.apiKey && patch.model.apiKey.includes("•")) cfg.model.apiKey = config.model.apiKey;
  if (!cfg.model.apiKey.trim()) return { ok: false, error: "还没有填 API Key。" };
  try {
    const result = await callLLM(cfg, [{ role: "user", content: "只回两个字：在的" }], {
      maxTokens: 20,
      temperature: 0,
      model: cfg.model.model,
    });
    return { ok: true, text: result.content, model: result.model };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "连接失败。" };
  }
});

app.get("/api/settings", async () => ({
  config: maskConfig(config),
  root,
  pricing: peakInfo(Date.now(), config.behavior.timezone),
  prices: MODEL_PRICES,
  modelOptions: [
    { value: "deepseek-flash", label: "DeepSeek Flash（便宜、快）" },
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro（更聪明、贵）" },
  ],
}));

app.put("/api/settings", async (request, reply) => {
  const body = requireObject(request.body);
  const patch = requireObject(body.config ?? body) as Partial<AppConfig>;
  const safe = structuredClone(patch);
  if (safe.model?.apiKey && safe.model.apiKey.includes("•")) safe.model.apiKey = config.model.apiKey;

  const oldPort = config.ui.port;
  const next = deepMerge<AppConfig>(config, safe);
  if (!next.name.trim()) next.name = config.name;
  if (!next.ownerTitle.trim()) next.ownerTitle = config.ownerTitle;
  if (!next.model.baseUrl.trim()) next.model.baseUrl = config.model.baseUrl;
  if (!next.model.model.trim()) next.model.model = config.model.model;
  if (!next.model.sideModel.trim()) next.model.sideModel = next.model.model;
  next.model.temperature = Math.max(0, Math.min(2, Number(next.model.temperature) || 1));
  next.cost.dailyBudgetCny = Math.max(0, Number(next.cost.dailyBudgetCny) || 0);
  next.behavior.historyMessages = Math.max(4, Math.min(100, Number(next.behavior.historyMessages) || 40));
  next.behavior.historyPeakMessages = Math.max(4, Math.min(100, Number(next.behavior.historyPeakMessages) || 16));
  next.behavior.maxOutputTokens = Math.max(100, Math.min(4000, Number(next.behavior.maxOutputTokens) || 800));
  next.behavior.maxOutputTokensPeak = Math.max(80, Math.min(2000, Number(next.behavior.maxOutputTokensPeak) || 320));
  next.speak.chance = Math.max(0, Math.min(1, Number(next.speak.chance) || 0.3));
  next.mood.base = Math.max(0, Math.min(100, Number(next.mood.base) || 65));

  saveConfig(p, next);
  config = next;
  memory.setConfig(config);
  refreshContext();
  onChange();
  return { ok: true, config: maskConfig(config), note: next.ui.port !== oldPort ? "端口改动需要重启服务。" : undefined };
});

// ---------- errors & static web ----------

app.setErrorHandler((error, _request, reply) => {
  const err = error as { statusCode?: number; message?: string };
  app.log.error(error);
  reply.code(err.statusCode ?? 500).send({ error: err.message || "服务端出了点问题。" });
});

await app.register(fastifyStatic, {
  root: p.media,
  prefix: "/media/",
  decorateReply: false,
  index: false,
});

const here = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(here, "../web/dist");
if (exists(path.join(staticRoot, "index.html"))) {
  await app.register(fastifyStatic, { root: staticRoot, prefix: "/" });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.type("text/html").send(fs.readFileSync(path.join(staticRoot, "index.html"), "utf8"));
    }
    return reply.code(404).send({ error: "没有这个页面。" });
  });
} else {
  app.get("/", async () => ({
    ok: true,
    message: "chatBridge API 在跑。Web UI 还没构建：开发时用 npm run dev，或先 npm run build:web。",
    root,
  }));
}

const port = Number(config.ui.port) || 7788;
try {
  await app.listen({ host: "127.0.0.1", port });
  scheduler.start();
  console.log(`\n  chatBridge · ${config.name} 的房间`);
  console.log(`  http://127.0.0.1:${port}`);
  console.log(`  数据：${root}\n`);
} catch (error) {
  console.error("chatBridge 启动失败：", error);
  process.exit(1);
}

async function shutdown(): Promise<void> {
  scheduler.stop();
  agent.stop();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
