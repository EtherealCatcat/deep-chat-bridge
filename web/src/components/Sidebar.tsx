import {
  BookOpen,
  Brain,
  Bug,
  Feather,
  MessageCircle,
  Settings2,
  Sprout,
  Sun,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { Page, Status } from "../types";
import { WhaleAvatar } from "./ui";

const items: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "chat", label: "聊天", icon: MessageCircle },
  { page: "today", label: "今天", icon: Sun },
  { page: "memory", label: "记忆", icon: Brain },
  { page: "diary", label: "日记", icon: BookOpen },
  { page: "persona", label: "人设", icon: Feather },
  { page: "growth", label: "成长", icon: Sprout },
  { page: "settings", label: "设置", icon: Settings2 },
  { page: "debug", label: "调试", icon: Bug },
];

const phaseDot: Record<Status["rhythm"]["phase"], string> = {
  asleep: "bg-ink-faint",
  waking: "bg-gold",
  awake: "bg-sea",
  sleepy: "bg-coral",
};

export function Sidebar({
  status,
  page,
  onNavigate,
  connected,
}: {
  status: Status | null;
  page: Page;
  onNavigate: (page: Page) => void;
  connected: boolean;
}) {
  const name = status?.name ?? "鲸鲸";
  const phase = status?.rhythm.phase ?? "awake";
  const pricing = status?.pricing;

  return (
    <aside className="flex h-full w-[226px] shrink-0 flex-col border-r border-line/55 bg-[rgba(247,240,230,0.52)] px-3.5 py-5 backdrop-blur-md">
      <div className="mb-5 flex items-center gap-3 px-1.5">
        <WhaleAvatar size="md" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight text-ink">{name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-soft">
            <span className={`h-1.5 w-1.5 rounded-full ${phaseDot[phase]}`} />
            <span className="truncate">{status?.rhythm.label ?? "醒着"}</span>
            {status?.rhythm.woken ? <span className="text-gold">· 刚醒</span> : null}
          </div>
        </div>
      </div>

      <div className="mx-1 mb-4 h-px bg-line/55" />

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = page === item.page;
          return (
            <button
              key={item.page}
              type="button"
              onClick={() => onNavigate(item.page)}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.page === "chat" && status?.unread ? (
                <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[9px] font-semibold text-white">
                  {status.unread > 9 ? "9+" : status.unread}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="paper-inset px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            <Waves className="h-3 w-3" />
            房间
          </div>
          <div className="truncate text-[12px] text-ink-soft">{status?.room.status ?? "在书桌前"}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-ink-faint">
            {status?.room.detail ?? "台灯亮着"}
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[10.5px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-sea" : "bg-coral"}`}
            />
            {connected ? "已连上房间" : "连接断开"}
          </span>
          <span className="tabular">¥{(status?.usage.costCny ?? 0).toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[10.5px] transition ${
            pricing?.isPeak
              ? "border-gold/30 bg-gold/10 text-[#876529]"
              : "border-sea/20 bg-sea/10 text-sea-deep"
          }`}
          title={pricing?.reason}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${pricing?.isPeak ? "bg-gold" : "bg-sea"}`} />
            {pricing?.isPeak ? "忙时 · 省着说" : "闲时"}
          </span>
          <span className="opacity-60">计费</span>
        </button>
      </div>
    </aside>
  );
}
