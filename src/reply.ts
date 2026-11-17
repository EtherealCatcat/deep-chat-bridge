import type { AppConfig, ChatTurnResult } from "./types.js";

export interface GuardResult {
  violation: boolean;
  reasons: string[];
}

const ASSISTANT_PATTERNS: [RegExp, string][] = [
  [/作为(一个)?(AI|人工智能|语言模型|助手)/i, "自称 AI/助手"],
  [/语言模型/, "提到语言模型"],
  [/有什么(可以|能)帮(你|您)/, "客服腔"],
  [/希望(这|以上|我的回答).{0,8}(帮助|有用)/, "客服腔"],
  [/以下(是|为).{0,10}(总结|建议|分析)/, "总结腔"],
  [/首先[，,].{0,40}其次/, "分点说教"],
  [/总的来说|综上所述|需要注意的是/, "总结腔"],
  [/建议你(可以|不妨|试试)/, "建议腔"],
  [/根据(你|您的)(描述|情况)/, "咨询腔"],
  [/我理解你的感受/, "咨询腔"],
  [/当然可以[，,！!]/, "客服腔"],
  [/请问还有(什么|其他)/, "客服腔"],
];

export function cleanReply(raw: string): string {
  let text = raw ?? "";
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "");
  text = text.replace(/<此刻>[\s\S]*?<\/此刻>/gi, "");
  text = text.replace(/<内心>[\s\S]*?<\/内心>/gi, "");
  text = text.replace(/<untrusted_web[\s\S]*?<\/untrusted_web>/gi, "");
  text = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, "").trim());
  text = text.replace(/<\/?(?:assistant|system|user|tool)>/gi, "");
  text = text.replace(/^(鲸鲸|我|她|助手)\s*[:：]\s*/gm, "");
  text = text.replace(/^\s*[-*•]\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/[ \t]+\n/g, "\n");
  return text.trim();
}

export function styleGuard(raw: string): GuardResult {
  const reasons: string[] = [];
  for (const [pattern, reason] of ASSISTANT_PATTERNS) {
    if (pattern.test(raw)) reasons.push(reason);
  }
  if (/<system-reminder|<此刻>|<内心>/i.test(raw)) reasons.push("泄漏内部标签");
  if (/^\s*#{1,3}\s/m.test(raw)) reasons.push("Markdown 标题");
  if (/\*\*.+\*\*/.test(raw)) reasons.push("Markdown 加粗");
  return { violation: reasons.length > 0, reasons: [...new Set(reasons)] };
}

function stripOuterQuotes(text: string): string {
  const pairs: [string, string][] = [
    ["“", "”"],
    ["「", "」"],
    ['"', '"'],
  ];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > 2) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^。！？!?…\n]+[。！？!?…]?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (sentence.length <= max) {
      current = sentence;
    } else {
      const pieces = sentence.match(/[^，、；,;]+[，、；,;]?/g) ?? [sentence];
      let piece = "";
      for (const part of pieces) {
        if ((piece + part).length > max && piece) {
          chunks.push(piece.trim());
          piece = part;
        } else {
          piece += part;
        }
      }
      current = piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function parseReply(raw: string, config: AppConfig): ChatTurnResult {
  const text = cleanReply(raw);
  const bubbles: ChatTurnResult["bubbles"] = [];
  let silent = false;
  const lines = text.split(/\n+/);

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^（?\(?不回\)?）?$/.test(line)) {
      silent = true;
      continue;
    }

    const sticker = /^\[表情[:：]\s*(.+?)\]$/.exec(line);
    if (sticker) {
      bubbles.push({ kind: "sticker", text: sticker[1].trim() });
      continue;
    }

    const mono = /^（?(?:独白|心里想|心里|想)[:：]\s*([\s\S]+?)\)?）?$/.exec(line);
    if (mono) {
      bubbles.push({ kind: "monologue", text: stripOuterQuotes(mono[1].trim()) });
      continue;
    }

    line = line.replace(/^\[表情[:：]\s*(.+?)\]/, "[表情:$1]");
    const inlineSticker = /\[表情[:：]\s*(.+?)\]/.exec(line);
    if (inlineSticker && line.replace(inlineSticker[0], "").trim() === "") {
      bubbles.push({ kind: "sticker", text: inlineSticker[1].trim() });
      continue;
    }

    line = stripOuterQuotes(line);
    if (!line) continue;
    for (const chunk of splitLong(line, 120)) {
      bubbles.push({ kind: "text", text: chunk });
    }
  }

  if (!bubbles.length && !silent) {
    silent = true;
  }

  const max = Math.max(1, config.behavior.maxBubbles);
  if (bubbles.length > max) {
    const kept = bubbles.slice(0, max);
    const rest = bubbles.slice(max);
    const tail = kept[kept.length - 1];
    if (tail.kind === "text") {
      tail.text = [tail.text, ...rest.map((b) => b.text)].join(" ");
    }
    return { bubbles: kept, silent: false, raw, toolCalls: [] };
  }

  return { bubbles, silent: silent && bubbles.length === 0, raw, toolCalls: [] };
}

export function typingMs(text: string, config: AppConfig): number {
  const cps = Math.max(1, config.behavior.typingCps);
  const base = (text.length / cps) * 1000;
  const jitter = 200 + Math.random() * 500;
  return Math.round(Math.min(9000, Math.max(900, base + jitter)));
}

export function gapMs(): number {
  return Math.round(500 + Math.random() * 1100);
}
