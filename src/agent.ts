import fs from "node:fs";
import path from "node:path";
import type { AppConfig, ChatMessage, LLMMessage, OwnTimeState, QuoteRef, SceneKind } from "./types.js";
import type { Paths } from "./config.js";
import type { MemoryStore } from "./memory.js";
import type { ServerEvent } from "./events.js";
import { buildNow, buildSystem } from "./persona.js";
import { getRhythm, rhythmPrompt } from "./rhythm.js";
import { loadLife } from "./life.js";
import { loadMood, saveMood, applyMood, heuristicMood, moodDeltaFromJson } from "./mood.js";
import { loadRoom } from "./room.js";
import { loadRelationship, saveRelationship, updateStreak } from "./relationship.js";
import { loadReminders, pendingReminders } from "./care.js";
import { listStickers, ensureStickers, findSticker } from "./stickers.js";
import { appendChatMessage, messagesBefore, quoteLine, toLLMHistory, yesterdayDigest, todayMessageCount, todayProactiveCount, lastOwnerMessageAt, ensureSession } from "./chat.js";
import { dayKey, formatClock } from "./time.js";
import { timelineSummary, appendTimeline } from "./timeline.js";
import { costPolicy, isPeak } from "./pricing.js";
import { todayUsage, recordUsage } from "./usage.js";
import { callLLM } from "./llm.js";
import { appendOwnLog } from "./web.js";
import { cleanReply, parseReply, styleGuard, typingMs, gapMs } from "./reply.js";
import { runToolLoop } from "./agentLoop.js";
import type { ToolContext, OutboxItem } from "./tools.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ChatImage {
  file: string;
  mime: string;
}

export interface AgentContext {
  config: AppConfig;
  paths: Paths;
  memory: MemoryStore;
  persona: string;
}

export class ChatAgent {
  private pending: { text: string; ts: number; quote?: QuoteRef; image?: ChatImage }[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ownMode = false;
  private abort: AbortController | null = null;
  private turnSeq = 0;
  private sentInTurn = false;
  private historyFrom = 0;
  private debug: Record<string, unknown> | null = null;

  constructor(
    private ctx: AgentContext,
    private emit: (event: ServerEvent) => void,
    private onChange: () => void,
  ) {}

  get busy(): boolean {
    return this.running;
  }

  setContext(ctx: AgentContext): void {
    this.ctx = ctx;
  }

  enqueue(text: string, ts = Date.now(), quote?: QuoteRef, image?: ChatImage): void {
    const clean = text.trim();
    if (!clean && !image) return;
    this.pending.push({ text: clean || "（发来一张图片）", ts, quote, image });
    if (this.running && this.ownMode) {
      this.abort?.abort();
      return;
    }
    if (!this.running) this.arm();
  }

  getDebug(): Record<string, unknown> | null {
    return this.debug;
  }

  newSession(): void {
    this.historyFrom = Date.now();
    this.emit({ type: "read", at: Date.now() });
    this.onChange();
  }

  stop(): void {
    this.pending = [];
    this.ownMode = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.abort?.abort();
    if (this.running) {
      this.running = false;
      this.emit({ type: "busy", busy: false });
      this.onChange();
    }
  }

  private arm(delay = this.ctx.config.behavior.burstMs): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, Math.max(300, delay));
  }

  private async flush(): Promise<void> {
    if (this.running || !this.pending.length) return;
    const batch = this.pending.splice(0);
    const firstTs = batch[0]?.ts ?? Date.now();
    const text = batch.map((item) => item.text).join("\n");
    const quote = batch.find((item) => item.quote)?.quote;
    const image = batch.find((item) => item.image)?.image;
    await this.runTurn(text, firstTs, false, quote, image);
    if (this.pending.length && !this.running) this.arm(300);
  }

  async proactive(nudge: string): Promise<boolean> {
    if (this.running || this.pending.length) return false;
    this.sentInTurn = false;
    await this.runTurn(nudge, Date.now(), true);
    return this.sentInTurn;
  }

  private async runTurn(
    text: string,
    firstTs: number,
    proactive: boolean,
    quote?: QuoteRef,
    image?: ChatImage,
  ): Promise<void> {
    const { config, paths, memory } = this.ctx;
    const turnId = `turn-${Date.now().toString(36)}-${++this.turnSeq}`;
    this.running = true;
    this.sentInTurn = false;
    this.abort = new AbortController();
    this.emit({ type: "busy", busy: true });
    this.onChange();

    try {
      if (!config.model.apiKey.trim()) {
        this.emit({ type: "error", message: "还没有配置 DeepSeek API Key。打开设置，把 key 填进去。" });
        return;
      }

      const now = Date.now();
      const day = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
      const usage = todayUsage(paths, config);
      const policy = costPolicy(config, usage, now);
      const historyLimit = Math.max(1, policy.historyMessages);
      const history = toLLMHistory(
        messagesBefore(paths, config, firstTs, historyLimit).filter((m) => m.ts >= this.historyFrom),
        historyLimit,
        config,
      );
      const relationship = loadRelationship(paths, config);
      const rhythm = getRhythm(config, loadLife(paths), now);
      const mood = loadMood(paths, config);
      const room = loadRoom(paths);
      const reminders = pendingReminders(paths);
      const todaySummary = timelineSummary(paths, config, day);
      const recalls = memory.recall(text, 3);
      const justRemembered = memory.recentInbox(4);
      const stickers = ensureStickers(paths);

      const system = buildSystem({
        config,
        kind: "chat",
        memory: memory.prompt(),
        relationship,
        yesterdaySummary: yesterdayDigest(paths, config),
        room,
        persona: this.ctx.persona,
      });
      const nowBlock = buildNow({
        config,
        kind: "chat",
        now,
        rhythm: rhythmPrompt(rhythm, config),
        mood,
        room,
        todaySummary,
        reminders,
        relationship,
        lastOwnerAt: lastOwnerMessageAt(paths, config),
        todayMessages: todayMessageCount(paths, config),
        proactiveToday: todayProactiveCount(paths, config),
        recalls,
        justRemembered,
        stickers,
      });

      const body = proactive
        ? `<内心>\n${text}\n</内心>`
        : `${quote ? `${quoteLine(quote, config)}\n` : ""}${config.ownerTitle}：${text}`;
      let userContent: LLMMessage["content"] = `${nowBlock}\n\n${body}`;
      if (image && !proactive) {
        const file = path.join(paths.media, path.basename(image.file));
        if (fs.existsSync(file)) {
          const base64 = fs.readFileSync(file).toString("base64");
          userContent = [
            { type: "text", text: `${nowBlock}\n\n${body}` },
            { type: "image_url", image_url: { url: `data:${image.mime};base64,${base64}` } },
          ];
        }
      }
      const messages: LLMMessage[] = [
        { role: "system", content: system },
        ...history,
        { role: "user", content: userContent },
      ];

      ensureSession(paths, config);
      if (!proactive && todayMessageCount(paths, config) === 1) {
        updateStreak(paths, config);
      }

      const outbox: OutboxItem[] = [];
      const toolContext: ToolContext = {
        config,
        paths,
        scene: "chat",
        memory,
        now,
        outbox,
      };

      const result = await runToolLoop({
        config,
        paths,
        messages,
        scene: "chat",
        maxSteps: policy.maxToolSteps,
        maxTokens: policy.maxOutputTokens,
        toolContext,
        kind: proactive ? "proactive" : "chat",
        signal: this.abort.signal,
      });

      let raw = result.content.trim();
      if (raw && styleGuard(raw).violation && !policy.isPeak && policy.budgetState !== "exhausted") {
        raw = await this.retryStyle(raw, messages, policy.maxOutputTokens);
      }

      const parsed = parseReply(raw, config);
      this.debug = {
        at: now,
        turnId,
        proactive,
        system: system.slice(0, 8000),
        nowBlock: nowBlock.slice(0, 6000),
        history: history.slice(-12),
        raw: raw.slice(0, 4000),
        toolCalls: result.toolCalls,
        bubbles: parsed.bubbles,
        silent: parsed.silent,
      };
      const bubbles = parsed.bubbles;
      if (!bubbles.length || parsed.silent) {
        if (!proactive) {
          const silent = appendChatMessage(paths, config, {
            role: "assistant",
            kind: "silent",
            text: "",
          });
          this.emit({ type: "message", message: silent });
          this.emit({ type: "read", at: Date.now() });
        }
      } else {
        await this.deliver(bubbles, proactive);
        this.sentInTurn = true;
      }

      for (const item of outbox) {
        if (item.kind === "sticker") {
          await this.deliverSticker(item.text, proactive);
        } else if (item.kind === "image") {
          await this.deliverImage(item.text, proactive);
        }
      }

      if (!proactive) this.emit({ type: "read", at: Date.now() });

      const replyText = bubbles
        .filter((b) => b.kind === "text")
        .map((b) => b.text)
        .join(" ");
      await this.updateMood(text, replyText, policy);
      appendTimeline(paths, config, {
        kind: proactive ? "speak" : "chat",
        text: proactive ? "主动找主人说话" : `和${config.ownerTitle}聊了 ${text.length} 字`,
        meta: { proactive, bubbles: bubbles.length, turns: 1, chars: text.length },
      });
      this.emit({
        type: "timeline",
        event: {
          ts: Date.now(),
          kind: proactive ? "speak" : "chat",
          text: proactive ? "主动找主人说话" : "聊天",
        },
      });
    } catch (error) {
      if (this.abort?.signal.aborted) return;
      const message = error instanceof Error ? error.message : "出了点问题，稍后再试。";
      this.emit({ type: "error", message });
    } finally {
      this.running = false;
      this.abort = null;
      this.emit({ type: "done", turnId });
      this.emit({ type: "busy", busy: false });
      this.onChange();
    }
  }

  async runOwnTime(now: number, windowEnd: number): Promise<{ ok: boolean; summary: string; shares: string[]; error?: string }> {
    const { config, paths, memory } = this.ctx;
    if (this.running) return { ok: false, summary: "", shares: [], error: "正忙着。" };

    this.running = true;
    this.ownMode = true;
    this.abort = new AbortController();
    this.emit({ type: "busy", busy: true });
    this.onChange();

    try {
      if (!config.model.apiKey.trim()) {
        return { ok: false, summary: "", shares: [], error: "还没有配置 API Key。" };
      }
      if (!config.web.ownTimeEnabled) {
        return { ok: false, summary: "", shares: [], error: "自己的时间关着。" };
      }
      const usage = todayUsage(paths, config);
      const policy = costPolicy(config, usage, now);
      if (!policy.allowOwnTime) {
        return { ok: false, summary: "", shares: [], error: policy.reason };
      }

      const day = dayKey(now, config.behavior.rotateHour, config.behavior.timezone);
      const relationship = loadRelationship(paths, config);
      const rhythm = getRhythm(config, loadLife(paths), now);
      const mood = loadMood(paths, config);
      const room = loadRoom(paths);
      const reminders = pendingReminders(paths);
      const todaySummary = timelineSummary(paths, config, day);
      const recalls = memory.recall("最近 自己 想做的事 笔记", 3);
      const justRemembered = memory.recentInbox(3);

      const system = buildSystem({
        config,
        kind: "own",
        memory: memory.prompt(),
        relationship,
        yesterdaySummary: yesterdayDigest(paths, config),
        room,
        persona: this.ctx.persona,
      });
      const nowBlock = buildNow({
        config,
        kind: "own",
        now,
        rhythm: rhythmPrompt(rhythm, config),
        mood,
        room,
        todaySummary,
        reminders,
        relationship,
        lastOwnerAt: lastOwnerMessageAt(paths, config),
        todayMessages: todayMessageCount(paths, config),
        proactiveToday: todayProactiveCount(paths, config),
        recalls,
        justRemembered,
        stickers: [],
        activity: "自己的时间",
      });

      const canWeb = config.web.enabled;
      const body = `<内心>
现在是你的自己的时间（${formatClock(now, config.behavior.timezone)} 到 ${formatClock(windowEnd, config.behavior.timezone)}）。主人没有来找你。
你可以先翻翻笔记（note_read）或记忆（recall），${canWeb ? "看看订阅（rss_read），挑一篇读（web_read），或者搜一下（web_search），" : "今天网络关着，就在房间里待着，"}或者什么都不做。
如果看到什么真想告诉他，用 tell_owner（今天最多 ${config.speak.tellOwnerMaxPerDay} 次）。
不要为了显得有用而做事。结束时用一两句话记下你做了什么、想了什么。
</内心>`;

      const outbox: OutboxItem[] = [];
      const toolContext: ToolContext = {
        config,
        paths,
        scene: "own",
        memory,
        now,
        outbox,
      };
      const result = await runToolLoop({
        config,
        paths,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${nowBlock}

${body}` },
        ],
        scene: "own",
        maxSteps: Math.min(8, Math.max(3, policy.maxToolSteps + 2)),
        maxTokens: policy.maxOutputTokens,
        toolContext,
        kind: "own",
        signal: this.abort.signal,
      });

      const summary = cleanReply(result.content).slice(0, 1200) || "在房间里坐了一会儿，什么也没做。";
      appendOwnLog(paths, config, summary, now);
      const shares = outbox.filter((item) => item.kind === "text").map((item) => item.text.trim()).filter(Boolean);
      const nextMood = applyMood(loadMood(paths, config), { ...heuristicMood(summary), source: "own" }, config);
      saveMood(paths, nextMood);
      this.emit({ type: "mood", mood: nextMood });
      appendTimeline(paths, config, {
        kind: "own",
        text: `过了会儿自己的时间：${summary.replace(/\s+/g, " ").slice(0, 80)}`,
        meta: { shares: shares.length },
        ts: now,
      });
      this.emit({
        type: "timeline",
        event: { ts: now, kind: "own", text: "自己的时间" },
      });
      return { ok: true, summary, shares };
    } catch (error) {
      if (this.abort?.signal.aborted) return { ok: false, summary: "", shares: [], error: "被打断了。" };
      const message = error instanceof Error ? error.message : "自己的时间出了点问题。";
      return { ok: false, summary: "", shares: [], error: message };
    } finally {
      this.running = false;
      this.ownMode = false;
      this.abort = null;
      this.emit({ type: "busy", busy: false });
      this.onChange();
      if (this.pending.length) this.arm(400);
    }
  }

  async say(text: string, proactive = true): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    this.emit({ type: "typing", on: true });
    await sleep(Math.min(1800, 400 + clean.length * 35));
    this.emit({ type: "typing", on: false });
    const msg = appendChatMessage(this.ctx.paths, this.ctx.config, {
      role: "assistant",
      kind: "text",
      text: clean,
      meta: proactive ? { proactive: true } : undefined,
    });
    this.emit({ type: "message", message: msg });
    this.sentInTurn = true;
    this.onChange();
  }

  private async retryStyle(raw: string, messages: LLMMessage[], maxTokens: number): Promise<string> {
    const { config, paths } = this.ctx;
    try {
      const result = await callLLM(
        config,
        [
          ...messages,
          { role: "assistant", content: raw },
          { role: "user", content: "（重说。就像平时发消息，短一点，别解释，别像助手。）" },
        ],
        { maxTokens: Math.min(maxTokens, 300), temperature: 1.2, signal: this.abort?.signal },
      );
      recordUsage(paths, config, {
        model: result.model,
        provider: config.model.provider,
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        cacheHitTokens: result.usage.prompt_cache_hit_tokens,
        cacheMissTokens: result.usage.prompt_cache_miss_tokens,
        peak: isPeak(Date.now(), config.behavior.timezone),
        kind: "style-retry",
      });
      return result.content.trim() || raw;
    } catch {
      return raw;
    }
  }

  private async deliver(
    bubbles: { kind: "text" | "sticker" | "image" | "monologue" | "silent"; text: string }[],
    proactive: boolean,
  ): Promise<void> {
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      if (bubble.kind === "silent") continue;
      if (bubble.kind === "sticker") {
        await this.deliverSticker(bubble.text, proactive);
      } else if (bubble.kind === "image") {
        await this.deliverImage(bubble.text, proactive);
      } else if (bubble.kind === "monologue") {
        await this.emitTyping(false);
        const msg = appendChatMessage(this.ctx.paths, this.ctx.config, {
          role: "assistant",
          kind: "monologue",
          text: bubble.text,
          meta: { proactive },
        });
        this.emit({ type: "message", message: msg });
      } else {
        this.emit({ type: "typing", on: true });
        await sleep(typingMs(bubble.text, this.ctx.config));
        this.emit({ type: "typing", on: false });
        const msg = appendChatMessage(this.ctx.paths, this.ctx.config, {
          role: "assistant",
          kind: "text",
          text: bubble.text,
          meta: proactive ? { proactive: true } : undefined,
        });
        this.emit({ type: "message", message: msg });
      }
      if (i < bubbles.length - 1) await sleep(gapMs());
    }
  }

  private async deliverSticker(name: string, proactive: boolean): Promise<void> {
    const { config, paths } = this.ctx;
    const sticker = findSticker(paths, name);
    const msg = appendChatMessage(paths, config, {
      role: "assistant",
      kind: "sticker",
      text: sticker?.name ?? name,
      meta: { ...(sticker?.emoji ? { emoji: sticker.emoji } : {}), ...(sticker?.file ? { file: sticker.file } : {}), proactive },
    });
    await this.emitTyping(false, 250);
    this.emit({ type: "message", message: msg });
  }

  private async deliverImage(file: string, proactive: boolean): Promise<void> {
    const { config, paths } = this.ctx;
    const msg = appendChatMessage(paths, config, {
      role: "assistant",
      kind: "image",
      text: "",
      meta: { file, proactive },
    });
    this.emit({ type: "message", message: msg });
  }

  private async emitTyping(on: boolean, wait = 0): Promise<void> {
    this.emit({ type: "typing", on });
    if (on && wait > 0) await sleep(wait);
  }

  private async updateMood(userText: string, replyText: string, policy: ReturnType<typeof costPolicy>): Promise<void> {
    const { config, paths } = this.ctx;
    if (!config.mood.enabled) return;
    try {
      if (policy.allowSideCalls && policy.budgetState !== "exhausted") {
        const result = await callLLM(
          config,
          [
            {
              role: "system",
              content:
                "你是情绪观察器。读一段主人和角色的对话，判断角色心情的变化。只输出 JSON：{\"delta\":-15到15的整数,\"dims\":{\"happy\":...,\"calm\":...,\"sweet\":...,\"miss\":...,\"shy\":...,\"worry\":...,\"sad\":...,\"jealous\":...,\"angry\":...,\"bored\":...,\"heartache\":...},\"reason\":\"一句话\"}。dims 每项 -30 到 30，没有变化就省略。",
            },
            {
              role: "user",
              content: `${config.ownerTitle}：${userText.slice(0, 1200)}\n${config.name}：${replyText.slice(0, 1200)}`,
            },
          ],
          { maxTokens: 180, model: config.model.sideModel, temperature: 0.2, json: true, signal: this.abort?.signal },
        );
        recordUsage(paths, config, {
          model: result.model,
          provider: config.model.provider,
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          cacheHitTokens: result.usage.prompt_cache_hit_tokens,
          cacheMissTokens: result.usage.prompt_cache_miss_tokens,
          peak: isPeak(Date.now(), config.behavior.timezone),
          kind: "mood",
        });
        const parsed = safeJson(result.content);
        const change = moodDeltaFromJson(parsed);
        if (change) {
          const next = applyMood(loadMood(paths, config), { ...change, source: "chat" }, config);
          saveMood(paths, next);
          this.emit({ type: "mood", mood: next });
          return;
        }
      }
      const next = applyMood(loadMood(paths, config), { ...heuristicMood(`${userText}\n${replyText}`), source: "chat" }, config);
      saveMood(paths, next);
      this.emit({ type: "mood", mood: next });
    } catch {
      // Mood is best-effort; never fail a reply because of it.
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function formatNow(ts: number, config: AppConfig): string {
  return formatClock(ts, config.behavior.timezone);
}
