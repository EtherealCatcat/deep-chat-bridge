import type { AppConfig, LLMMessage, LLMResult, LLMUsage, ToolCall } from "./types.js";

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly body = "",
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: "auto" | "none";
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function friendlyError(status: number, body: string): string {
  if (status === 401 || status === 403) return "API Key 无效或没有权限。去设置里检查一下。";
  if (status === 402) return "账户余额不足，DeepSeek 拒绝了请求。";
  if (status === 429) return "请求太频繁或额度受限，稍后再试。";
  if (status >= 500) return "模型服务暂时不可用，稍后再试。";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // ignore
  }
  return body.slice(0, 300) || `请求失败（HTTP ${status}）`;
}

export async function callLLM(config: AppConfig, messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResult> {
  if (!config.model.apiKey.trim()) {
    throw new LLMError("还没有配置 DeepSeek API Key。打开设置，把 key 填进去。", 401);
  }
  const model = options.model ?? config.model.model;
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => {
      const out: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.name) out.name = m.name;
      if (m.tool_calls?.length) out.tool_calls = m.tool_calls;
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.reasoning_content) out.reasoning_content = m.reasoning_content;
      return out;
    }),
    temperature: options.temperature ?? config.model.temperature,
    max_tokens: options.maxTokens ?? config.behavior.maxOutputTokens,
    stream: false,
  };
  if (config.model.provider === "deepseek" && !config.model.thinking) {
    body.thinking = { type: "disabled" };
  }
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await fetch(endpoint(config.model.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.model.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) {
          await sleep(600 * attempt * attempt);
          continue;
        }
        throw new LLMError(friendlyError(response.status, text), response.status, text);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new LLMError("模型返回的不是合法 JSON。", response.status, text);
      }
      const root = parsed as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
        usage?: LLMUsage;
        error?: { message?: string };
      };
      if (root.error?.message) throw new LLMError(root.error.message, response.status, text);
      const choice = root.choices?.[0];
      const content = choice?.message?.content ?? "";
      const toolCalls = choice?.message?.tool_calls ?? [];
      return {
        content,
        toolCalls,
        usage: root.usage ?? {},
        model,
        finishReason: choice?.finish_reason ?? "stop",
      };
    } catch (error) {
      lastError = error;
      if (error instanceof LLMError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        if (attempt < maxAttempts) {
          await sleep(800 * attempt);
          continue;
        }
        throw new LLMError("模型响应超时。", 0);
      }
      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
    }
  }
  throw new LLMError(lastError instanceof Error ? lastError.message : "模型请求失败。");
}

export async function callJSON<T>(
  config: AppConfig,
  system: string,
  user: string,
  options: Omit<LLMOptions, "json"> = {},
): Promise<T | null> {
  const result = await callLLM(
    config,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...options, json: true, temperature: 0.2 },
  );
  return parseJSON<T>(result.content);
}

export function parseJSON<T>(raw: string): T | null {
  const text = raw.trim();
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 2));
}

export function trimMessages(messages: LLMMessage[], max: number): LLMMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
