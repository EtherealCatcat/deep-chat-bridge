import { Fragment, useEffect, useRef, useState } from "react";
import { CheckCheck, Feather, Quote, Send, Sparkles, X } from "lucide-react";
import type { ChatMessage, QuoteRef, Status } from "../types";
import { API_BASE, formatDay, formatTime } from "../api";
import { WhaleAvatar } from "./ui";

function MiniAvatar() {
  return (
    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6f968e] to-[#3f5f59] text-[13px] shadow-sm ring-1 ring-white/40">
      🐋
    </div>
  );
}

function DayDivider({ day }: { day: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-line/50" />
      <span className="text-[10px] tracking-[0.12em] text-ink-faint">{formatDay(day)}</span>
      <div className="h-px flex-1 bg-line/50" />
    </div>
  );
}

function QuoteBlock({ quote }: { quote: QuoteRef }) {
  const who = quote.role === "user" ? "你" : "鲸鲸";
  const body = quote.kind === "sticker" ? `[表情] ${quote.text}` : quote.text;
  return (
    <button
      type="button"
      onClick={() => document.getElementById(`msg-${quote.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      className="mb-1.5 block w-full rounded-lg border-l-2 border-coral/45 bg-ink/[0.04] px-2.5 py-1.5 text-left transition hover:bg-ink/[0.07]"
      title="跳到原消息"
    >
      <div className="truncate text-[9.5px] text-coral-deep/80">{who}</div>
      <div className="line-clamp-2 text-[10.5px] leading-4 text-ink-soft">{body}</div>
    </button>
  );
}

function MessageRow({
  message,
  readAt,
  lastAssistant,
  onQuote,
}: {
  message: ChatMessage;
  readAt: number | null;
  lastAssistant: boolean;
  onQuote: (message: ChatMessage) => void;
}) {
  const proactive = Boolean(message.meta?.proactive);

  if (message.kind === "silent") return null;

  if (message.role === "user") {
    return (
      <div id={`msg-${message.id}`} className="fade-up group flex justify-end">
        <div className="min-w-0 max-w-[82%]">
          {message.quote ? <QuoteBlock quote={message.quote} /> : null}
          <div className="bubble-me">{message.text}</div>
          <div className="mt-1 flex items-center justify-end gap-1.5 pr-1 text-[10px] text-ink-faint">
            <button
              type="button"
              onClick={() => onQuote(message)}
              className="inline-flex items-center gap-0.5 text-[9.5px] opacity-0 transition hover:text-coral group-hover:opacity-100"
            >
              <Quote className="h-2.5 w-2.5" />
              引用
            </button>
            <span>{formatTime(message.ts)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (message.kind === "sticker") {
    const emoji = String(message.meta?.emoji ?? "🫧");
    return (
      <div id={`msg-${message.id}`} className="fade-up flex items-start gap-2.5">
        <MiniAvatar />
        <div>
          <div className="grid h-20 w-20 place-items-center rounded-[20px] border border-line/60 bg-white/55 text-4xl shadow-sm">
            {emoji}
          </div>
          <div className="mt-1 pl-1 text-[10px] text-ink-faint">{message.text}</div>
        </div>
      </div>
    );
  }

  if (message.kind === "image") {
    const file = String(message.meta?.file ?? "");
    return (
      <div id={`msg-${message.id}`} className="fade-up flex items-start gap-2.5">
        <MiniAvatar />
        <img
          src={`${API_BASE}/media/${file.replace(/^\/+/, "")}`}
          alt="她发来的图片"
          className="max-h-72 max-w-[78%] rounded-2xl border border-line/60 object-cover shadow-sm"
        />
      </div>
    );
  }

  if (message.kind === "monologue") {
    return (
      <div id={`msg-${message.id}`} className="fade-up group flex items-start gap-2.5">
        <div className="w-7 shrink-0" />
        <div className="monologue">
          <div className="mb-1 text-[9px] font-sans uppercase tracking-[0.18em] text-ink-faint">
            心里想
          </div>
          {message.text}
          <button
            type="button"
            onClick={() => onQuote(message)}
            className="ml-2 inline-flex align-middle text-[9px] text-ink-faint opacity-0 transition hover:text-coral group-hover:opacity-100"
          >
            引用
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${message.id}`} className="fade-up group flex items-start gap-2.5">
      <MiniAvatar />
      <div className="min-w-0 max-w-[82%]">
        {message.quote ? <QuoteBlock quote={message.quote} /> : null}
        {proactive ? (
          <div className="mb-1 flex items-center gap-1 pl-0.5 text-[9.5px] tracking-[0.06em] text-coral/75">
            <Sparkles className="h-2.5 w-2.5" />
            她主动找你
          </div>
        ) : null}
        <div className="bubble-her">{message.text}</div>
        <div className="mt-1 flex items-center gap-1.5 pl-1 text-[10px] text-ink-faint">
          <span>{formatTime(message.ts)}</span>
          <button
            type="button"
            onClick={() => onQuote(message)}
            className="inline-flex items-center gap-0.5 text-[9.5px] opacity-0 transition hover:text-coral group-hover:opacity-100"
          >
            <Quote className="h-2.5 w-2.5" />
            引用
          </button>
          {lastAssistant && readAt && readAt >= message.ts ? (
            <span className="inline-flex items-center gap-0.5 text-sea/80">
              <CheckCheck className="h-3 w-3" />
              已读
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="fade-up flex items-end gap-2.5">
      <MiniAvatar />
      <div className="flex items-center gap-1.5 rounded-[19px] rounded-bl-[6px] border border-line/60 bg-[#fcf8f1] px-4 py-3 shadow-sm">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function PeakPill({ status }: { status: Status }) {
  const peak = status.pricing.isPeak;
  return (
    <div
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] sm:inline-flex ${
        peak
          ? "border-gold/30 bg-gold/10 text-[#876529]"
          : "border-sea/25 bg-sea/10 text-sea-deep"
      }`}
      title={`${status.pricing.reason} · 下次切换 ${formatTime(status.pricing.nextChangeAt)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${peak ? "bg-gold" : "bg-sea"}`} />
      {peak ? "忙时 · 说话简短" : "闲时"}
    </div>
  );
}

export function ChatView({
  status,
  messages,
  typing,
  readAt,
  onSend,
  onNavigateSettings,
}: {
  status: Status | null;
  messages: ChatMessage[];
  typing: boolean;
  readAt: number | null;
  onSend: (text: string, quote?: ChatMessage) => Promise<void>;
  onNavigateSettings: () => void;
}) {
  const [text, setText] = useState("");
  const [quote, setQuote] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  useEffect(() => {
    if (quote && !messages.some((m) => m.id === quote.id)) setQuote(null);
  }, [messages, quote]);

  useEffect(() => {
    stick.current = true;
    const timer = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (stick.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, typing]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function submit(value?: string) {
    const content = (value ?? text).trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSend(content, quote ?? undefined);
      setText("");
      setQuote(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
    } finally {
      setSending(false);
    }
  }

  const asleep = status?.rhythm.phase === "asleep";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3.5 border-b border-line/55 bg-[rgba(247,240,230,0.5)] px-5 py-3.5 backdrop-blur-md sm:px-7">
        <WhaleAvatar size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="serif truncate text-[21px] font-semibold tracking-tight text-ink">
              {status?.name ?? "鲸鲸"}
            </h1>
            {status?.rhythm.woken ? (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] text-[#876529]">
                刚被吵醒
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="truncate">{status?.rhythm.status ?? "在书桌前发呆"}</span>
            <span className="text-line">·</span>
            <span className="truncate">{status?.moodLabel ?? "心情还不错"}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <PeakPill status={status ?? emptyStatus} />
          <button
            type="button"
            onClick={onNavigateSettings}
            className="hidden text-right text-[10px] leading-4 text-ink-faint transition hover:text-coral sm:block"
            title="查看今日用量和计费设置"
          >
            <div className="tabular text-[11px] text-ink-soft">
              ¥{(status?.usage.costCny ?? 0).toFixed(2)}
            </div>
            <div>今日用量</div>
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7"
      >
        <div className="mx-auto flex w-full max-w-[780px] flex-col gap-3.5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center px-4 pb-10 pt-10 text-center sm:pt-16">
              <div className="relative mb-6">
                <WhaleAvatar size="xl" />
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-line/70 bg-paper-light text-[12px] shadow-sm">
                  🫧
                </span>
              </div>
              <h2 className="serif text-[23px] font-semibold text-ink">房间里很安静</h2>
              <p className="mt-2 max-w-sm text-[13px] leading-7 text-ink-soft">
                她在书桌前发呆，台灯亮着，鱼缸在冒泡。
                <br />
                说句话，或者只是打个招呼。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["在做什么呀？", "今天有点累。", "你还记得我们第一次说话吗？"].map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() => void submit(line)}
                    className="rounded-full border border-line/80 bg-white/45 px-3.5 py-1.5 text-[11.5px] text-ink-soft transition hover:border-coral/35 hover:bg-white/80 hover:text-coral-deep"
                  >
                    {line}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => (
            <Fragment key={message.id}>
              {index === 0 || messages[index - 1].dayKey !== message.dayKey ? (
                <DayDivider day={message.dayKey} />
              ) : null}
              <MessageRow
                message={message}
                readAt={readAt}
                lastAssistant={message.id === lastAssistantId}
                onQuote={(target) => {
                  setQuote(target);
                  textareaRef.current?.focus();
                }}
              />
            </Fragment>
          ))}

          {typing ? <TypingBubble /> : null}
          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      <div className="border-t border-line/55 bg-[rgba(247,240,230,0.55)] px-4 pb-4 pt-3 backdrop-blur-md sm:px-7">
        <div className="mx-auto w-full max-w-[780px]">
          {quote ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-coral/25 bg-coral/5 px-3 py-2">
              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-coral/70" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] tracking-[0.08em] text-coral-deep/75">
                  引用 {quote.role === "user" ? "你" : "鲸鲸"}
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-ink-soft">
                  {quote.kind === "sticker" ? `[表情] ${quote.text}` : quote.text}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuote(null)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-coral"
                title="取消引用"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2 rounded-[20px] border border-line/80 bg-[rgba(255,252,247,0.82)] p-1.5 pl-4 shadow-[0_8px_26px_rgba(82,61,42,.05)] transition focus-within:border-coral/40 focus-within:shadow-[0_0_0_3px_rgba(207,114,87,.08)]">
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(event) => {
                setText(event.target.value);
                const el = event.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && quote) {
                  setQuote(null);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={asleep ? "她睡着了，留言会等到早上…" : "和鲸鲸说点什么…"}
              className="max-h-[150px] min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-6 text-ink outline-none placeholder:text-ink-faint/80"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || sending}
              className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral text-white shadow-sm transition hover:bg-coral-deep disabled:cursor-default disabled:bg-line disabled:text-ink-faint"
              aria-label="发送"
            >
              <Send className="h-4 w-4 -translate-x-px" strokeWidth={1.9} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[9.5px] text-ink-faint">
            <span>Enter 发送 · Shift + Enter 换行</span>
            <span className="inline-flex items-center gap-1">
              <Feather className="h-2.5 w-2.5" />
              她可能已读不回，也可能突然找你
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyStatus = {
  pricing: {
    isPeak: false,
    reason: "按北京时间自动切换",
    nextChangeAt: Date.now(),
  },
  usage: { costCny: 0 },
} as unknown as Status;

