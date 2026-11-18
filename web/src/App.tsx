import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { API_BASE, api } from "./api";
import type { ChatMessage, Page, ServerEvent, Status } from "./types";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { TodayView } from "./components/TodayView";
import { MemoryView } from "./components/MemoryView";
import { DiaryView } from "./components/DiaryView";
import { PersonaView } from "./components/PersonaView";
import { GrowthView } from "./components/GrowthView";
import { SettingsView } from "./components/SettingsView";
import { DebugView } from "./components/DebugView";

type ToastKind = "info" | "error";

const pages: Page[] = ["chat", "today", "memory", "diary", "persona", "growth", "settings", "debug"];

function pageFromHash(): Page {
  const value = window.location.hash.replace(/^#/, "") as Page;
  return pages.includes(value) ? value : "chat";
}

export default function App() {
  const [page, setPageState] = useState<Page>(pageFromHash);
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const pageRef = useRef<Page>(page);

  pageRef.current = page;

  const setPage = useCallback((next: Page) => {
    setPageState(next);
    if (window.location.hash !== `#${next}`) {
      window.history.replaceState(null, "", `#${next}`);
    }
  }, []);

  const showToast = useCallback((text: string, kind: ToastKind = "info") => {
    setToast({ text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message].slice(-240)));
  }, []);

  const markRead = useCallback(async () => {
    try {
      await api.read();
      setReadAt(Date.now());
      setStatus((prev) => (prev ? { ...prev, unread: 0 } : prev));
    } catch {
      // 已读失败不影响聊天。
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([api.status(), api.messages(120)])
      .then(([nextStatus, history]) => {
        if (!alive) return;
        setStatus(nextStatus);
        setMessages(history.messages);
      })
      .catch((error) => {
        if (!alive) return;
        showToast(error instanceof Error ? error.message : "连不上本地服务。", "error");
      });
    return () => {
      alive = false;
    };
  }, [showToast]);

  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/events`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      let data: ServerEvent;
      try {
        data = JSON.parse(event.data) as ServerEvent;
      } catch {
        return;
      }
      switch (data.type) {
        case "status":
          setStatus(data.status);
          break;
        case "message":
          addMessage(data.message);
          break;
        case "typing":
          setTyping(data.on);
          break;
        case "read":
          setReadAt(data.at);
          break;
        case "busy":
          setStatus((prev) => (prev ? { ...prev, busy: data.busy } : prev));
          if (!data.busy) setTyping(false);
          break;
        case "error":
          showToast(data.message, "error");
          break;
        case "diary":
          showToast("她写完了今天的日记。");
          break;
        case "mood":
          setStatus((prev) => (prev ? { ...prev, mood: data.mood } : prev));
          break;
        case "done":
          setTyping(false);
          break;
        default:
          break;
      }
    };

    return () => source.close();
  }, [addMessage, showToast]);

  useEffect(() => {
    if (page !== "chat" || document.visibilityState !== "visible") return;
    const timer = window.setTimeout(() => void markRead(), 420);
    return () => window.clearTimeout(timer);
  }, [page, messages.length, markRead]);

  async function send(text: string, quote?: ChatMessage) {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const result = await api.send(trimmed, quote?.id);
      addMessage(result.message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "没发出去。", "error");
      throw error;
    }
  }

  function navigate(next: Page) {
    setPage(next);
    if (next === "chat") void markRead();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar status={status} page={page} onNavigate={navigate} connected={connected} />

      <main className={`min-w-0 flex-1 ${page === "chat" ? "h-full overflow-hidden" : "h-full overflow-y-auto"}`}>
        {page === "chat" ? (
          <ChatView
            status={status}
            messages={messages}
            typing={typing}
            readAt={readAt}
            onSend={send}
            onNavigateSettings={() => navigate("settings")}
          />
        ) : page === "today" ? (
          <TodayView status={status} showToast={showToast} />
        ) : page === "memory" ? (
          <MemoryView showToast={showToast} />
        ) : page === "diary" ? (
          <DiaryView showToast={showToast} />
        ) : page === "persona" ? (
          <PersonaView showToast={showToast} />
        ) : page === "growth" ? (
          <GrowthView showToast={showToast} />
        ) : page === "settings" ? (
          <SettingsView showToast={showToast} />
        ) : (
          <DebugView showToast={showToast} />
        )}
      </main>

      {toast ? (
        <div
          className={`fixed bottom-5 left-1/2 z-50 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[11.5px] shadow-lg backdrop-blur-md ${
            toast.kind === "error"
              ? "border-coral/30 bg-[#fff5f0]/95 text-coral-deep"
              : "border-sea/25 bg-[#f4faf6]/95 text-sea-deep"
          }`}
        >
          {toast.kind === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="leading-5">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
