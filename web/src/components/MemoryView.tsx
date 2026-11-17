import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Brain,
  Check,
  Heart,
  LoaderCircle,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "../api";
import type { MemorySnapshot } from "../types";
import { Badge, Card, Loading, SectionTitle } from "./ui";

type MemoryTab = "owner" | "me" | "we";

const tabs: { key: MemoryTab; label: string; icon: typeof UserRound; hint: string }[] = [
  { key: "owner", label: "关于主人", icon: UserRound, hint: "事实、喜好、雷区、答应过的事" },
  { key: "me", label: "关于她", icon: Heart, hint: "她对自己的认知和最近的想法" },
  { key: "we", label: "我们", icon: MessageSquare, hint: "一起经历过的事" },
];

export function MemoryView({ showToast }: { showToast: (text: string, kind?: "info" | "error") => void }) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [tab, setTab] = useState<MemoryTab>("owner");
  const [topic, setTopic] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await api.memory();
      setSnapshot(data);
      const initial = topic ?? "owner";
      if (initial.startsWith("topic:")) {
        const title = initial.slice(6);
        const found = data.topics.find((item) => item.title === title);
        setContent(found?.content ?? "");
      } else {
        setContent(data[initial as MemoryTab] ?? "");
      }
      setDirty(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "读取记忆失败。", "error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeName = topic ? `topic:${topic}` : tab;
  const activeLabel = topic
    ? topic
    : tabs.find((item) => item.key === tab)?.label ?? "记忆";

  const inbox = useMemo(
    () =>
      (snapshot?.inbox ?? [])
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4),
    [snapshot],
  );

  function selectTab(next: MemoryTab) {
    setTab(next);
    setTopic(null);
    setContent(snapshot?.[next] ?? "");
    setDirty(false);
  }

  function selectTopic(title: string) {
    setTopic(title);
    const found = snapshot?.topics.find((item) => item.title === title);
    setContent(found?.content ?? "");
    setDirty(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.saveMemory(activeName, content);
      showToast("记住了。旧的版本已经备份。");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  async function createTopic() {
    const title = newTopic.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      await api.saveMemory(`topic:${title}`, `# ${title}\n\n`);
      setNewTopic("");
      const data = await api.memory();
      setSnapshot(data);
      setTopic(title);
      setContent(`# ${title}\n\n`);
      setDirty(false);
      showToast("开了一个新话题。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "新建话题失败。", "error");
    } finally {
      setCreating(false);
    }
  }

  if (!snapshot) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
        <SectionTitle eyebrow="MEMORY" title="记忆" desc="她记住的东西，都摊在这里。" />
        <Loading />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
      <SectionTitle
        eyebrow="MEMORY"
        title="记忆"
        desc="她记住的事先放进收件箱，夜里再慢慢整理成自己的话。你可以随时改。"
        action={
          <div className="flex items-center gap-2">
            {dirty ? <Badge tone="coral">未保存</Badge> : <Badge tone="sea"><Check className="h-2.5 w-2.5" /> 已同步</Badge>}
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="btn-primary">
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存
            </button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[235px_1fr]">
        <div className="space-y-4">
          <Card className="p-2.5">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = !topic && tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTab(item.key)}
                  className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition ${
                    active ? "bg-coral/10 text-coral-deep" : "text-ink-soft hover:bg-white/45"
                  }`}
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-[9.5px] leading-4 text-ink-faint">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </Card>

          <Card className="p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <Archive className="h-3 w-3" />
                话题
              </div>
              <span className="text-[9.5px] text-ink-faint">{snapshot.topics.length}</span>
            </div>
            <div className="space-y-0.5">
              {snapshot.topics.length === 0 ? (
                <p className="py-1 text-[10.5px] leading-5 text-ink-faint">还没有分门别类，先聊着。</p>
              ) : (
                snapshot.topics.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => selectTopic(item.title)}
                    className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-[11.5px] transition ${
                      topic === item.title
                        ? "bg-sea/10 text-sea-deep"
                        : "text-ink-soft hover:bg-white/45"
                    }`}
                  >
                    {item.title}
                  </button>
                ))
              )}
            </div>
            <div className="mt-3 flex gap-1.5 border-t border-line/50 pt-3">
              <input
                value={newTopic}
                onChange={(event) => setNewTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createTopic();
                }}
                placeholder="新话题"
                className="input-warm min-w-0 flex-1 px-2 py-1 text-[10.5px]"
              />
              <button
                type="button"
                onClick={() => void createTopic()}
                disabled={!newTopic.trim() || creating}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line/80 text-ink-soft transition hover:border-coral/40 hover:text-coral disabled:opacity-40"
                title="新建话题"
              >
                {creating ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <Sparkles className="h-3 w-3" />
              今晚的收件箱
            </div>
            {inbox.length === 0 ? (
              <p className="text-[10.5px] leading-5 text-ink-faint">今天还没记新东西。</p>
            ) : (
              <div className="space-y-2">
                {inbox.map((item, index) => (
                  <p key={index} className="line-clamp-2 text-[10.5px] leading-5 text-ink-soft">
                    {item}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-2 border-t border-line/50 pt-2 text-[9px] leading-4 text-ink-faint">
              这些会在她写日记后，被整理进上面几页。
            </p>
          </Card>
        </div>

        <Card className="flex min-h-[560px] flex-col p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="serif text-[18px] text-ink">{activeLabel}</h3>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                {topic ? "一个话题页，按日期往下写。" : tabs.find((item) => item.key === tab)?.hint}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
              <Brain className="h-3 w-3" />
              {content.length} 字
            </div>
          </div>
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            placeholder="这里还空着。"
            className="min-h-[460px] flex-1 resize-none rounded-xl border border-line/60 bg-[rgba(255,252,247,0.48)] p-4 font-mono text-[12.5px] leading-7 text-ink outline-none transition focus:border-coral/35 focus:bg-white/70"
          />
          <div className="mt-3 flex items-center justify-between text-[9.5px] text-ink-faint">
            <span>Markdown 格式 · 保存前会自动备份</span>
            <span>上限 20,000 字</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
