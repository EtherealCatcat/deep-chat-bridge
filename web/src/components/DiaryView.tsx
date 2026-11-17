import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  LoaderCircle,
  Moon,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { api, formatDay } from "../api";
import type { DiaryMeta } from "../types";
import { EmptyState, Loading, SectionTitle } from "./ui";
import { Markdown } from "./Markdown";

export function DiaryView({ showToast }: { showToast: (text: string, kind?: "info" | "error") => void }) {
  const [diaries, setDiaries] = useState<DiaryMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [writing, setWriting] = useState(false);

  async function loadList(keep?: string | null) {
    try {
      const data = await api.diaries();
      setDiaries(data.diaries);
      const next = keep && data.diaries.some((item) => item.day === keep) ? keep : data.diaries[0]?.day ?? null;
      setSelected(next);
      if (next) await loadContent(next);
      else setContent("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "读取日记失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadContent(day: string) {
    setLoadingContent(true);
    try {
      const data = await api.diary(day);
      setContent(data.content);
    } catch (error) {
      setContent("");
      showToast(error instanceof Error ? error.message : "这一页打不开。", "error");
    } finally {
      setLoadingContent(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function selectDay(day: string) {
    setSelected(day);
    await loadContent(day);
  }

  async function writeNow() {
    if (writing) return;
    setWriting(true);
    try {
      const result = await api.writeDiary();
      if (result.ok) {
        showToast("她坐了一会儿，写下了一页。");
        await loadList(selected);
      } else {
        showToast(result.error ?? "今天还写不了。", "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "写日记失败。", "error");
    } finally {
      setWriting(false);
    }
  }

  const active = diaries.find((item) => item.day === selected);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
      <SectionTitle
        eyebrow="DIARY"
        title="日记"
        desc="每天睡前一页，写给她自己。"
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadList(selected)} className="btn-ghost">
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            <button type="button" onClick={() => void writeNow()} disabled={writing} className="btn-primary">
              {writing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PenLine className="h-3.5 w-3.5" />
              )}
              写今天的
            </button>
          </div>
        }
      />

      {loading ? (
        <Loading label="正在找她的日记本…" />
      ) : diaries.length === 0 ? (
        <EmptyState
          icon={<Moon className="h-5 w-5" />}
          title="她还没写过日记"
          desc="到了夜里，她会把今天的事写下来。也可以现在让她写一页。"
          action={
            <button type="button" onClick={() => void writeNow()} className="btn-primary">
              <PenLine className="h-3.5 w-3.5" />
              让她现在写
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[236px_1fr]">
          <div className="paper-card max-h-[calc(100vh-190px)] overflow-y-auto p-2.5">
            <div className="mb-2 flex items-center gap-1.5 px-2 pt-1 text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
              <CalendarDays className="h-3 w-3" />
              {diaries.length} 页
            </div>
            <div className="space-y-1">
              {diaries.map((item) => {
                const activeItem = item.day === selected;
                return (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() => void selectDay(item.day)}
                    className={`block w-full rounded-xl border px-2.5 py-2 text-left transition ${
                      activeItem
                        ? "border-coral/25 bg-coral/10"
                        : "border-transparent hover:border-line/60 hover:bg-white/45"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[11.5px] ${activeItem ? "text-coral-deep" : "text-ink"}`}>
                        {formatDay(item.day)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-ink-faint">{item.title}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <article className="paper-card flex min-h-[560px] flex-col p-6 sm:p-8">
            {loadingContent ? (
              <Loading label="正在翻页…" />
            ) : (
              <>
                <div className="mb-5 border-b border-line/50 pb-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-gold">
                    <BookOpen className="h-3 w-3" />
                    鲸鲸的日记
                  </div>
                  <h3 className="serif text-[24px] font-semibold tracking-tight text-ink">
                    {active ? formatDay(active.day) : "这一页"}
                  </h3>
                  <p className="mt-1 text-[10.5px] text-ink-faint">
                    {content.replace(/\s/g, "").length} 字 · 写于深夜
                  </p>
                </div>
                <div className="flex-1">
                  <Markdown text={content} />
                </div>
                <div className="mt-8 flex items-center justify-between border-t border-line/40 pt-3 text-[9px] text-ink-faint">
                  <span className="inline-flex items-center gap-1">
                    <Moon className="h-2.5 w-2.5" />
                    写完之后，她把本子合上了
                  </span>
                  <span>{active?.day}</span>
                </div>
              </>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
