import { useEffect, useState } from "react";
import {
  Check,
  Feather,
  FileText,
  Info,
  LoaderCircle,
  Save,
  Shield,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import { Badge, Card, Loading, SectionTitle } from "./ui";

const structure = [
  { title: "她是谁", desc: "名字、住处、日常身份。不用写成设定集。" },
  { title: "怎么说话", desc: "句子长短、口头禅、会不会嘴硬、什么时候沉默。" },
  { title: "喜欢什么", desc: "具体的物件和场景，比形容词更像一个人。" },
  { title: "在意什么", desc: "她的边界、怕的东西、不会妥协的地方。" },
];

export function PersonaView({ showToast }: { showToast: (text: string, kind?: "info" | "error") => void }) {
  const [persona, setPersona] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .persona()
      .then((data) => {
        if (!alive) return;
        setPersona(data.persona);
        setOriginal(data.persona);
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "读取人设失败。", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      await api.savePersona(persona);
      setOriginal(persona);
      setDirty(false);
      showToast("人设已更新，下一轮对话生效。旧版本已备份。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  const changedLines = persona.split("\n").filter((line) => !original.split("\n").includes(line)).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
      <SectionTitle
        eyebrow="PERSONA"
        title="人设"
        desc="她是谁，由你写。改的是底色，不是命令。"
        action={
          <div className="flex items-center gap-2">
            {dirty ? (
              <Badge tone="coral">有改动</Badge>
            ) : (
              <Badge tone="sea">
                <Check className="h-2.5 w-2.5" /> 已保存
              </Badge>
            )}
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="btn-primary">
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存人设
            </button>
          </div>
        }
      />

      {loading ? (
        <Loading label="正在读她的人设…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <Card className="flex min-h-[600px] flex-col p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <FileText className="h-3 w-3" />
                persona.md
              </div>
              <span className="text-[9.5px] text-ink-faint">{persona.replace(/\s/g, "").length} 字</span>
            </div>
            <textarea
              value={persona}
              onChange={(event) => {
                setPersona(event.target.value);
                setDirty(event.target.value !== original);
              }}
              spellCheck={false}
              placeholder="她叫什么？住在哪？说话是什么样子？"
              className="min-h-[500px] flex-1 resize-none rounded-xl border border-line/60 bg-[rgba(255,252,247,0.48)] p-4 text-[13px] leading-7 text-ink outline-none transition focus:border-coral/35 focus:bg-white/70"
            />
            <div className="mt-3 flex items-center justify-between text-[9.5px] text-ink-faint">
              <span>Markdown · 保存前自动备份，随时可以改回来</span>
              {dirty && changedLines > 0 ? <span>{changedLines} 行新内容</span> : <span>未改动</span>}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <Feather className="h-3 w-3" />
                可以写这些
              </div>
              <div className="space-y-3">
                {structure.map((item) => (
                  <div key={item.title} className="border-l-2 border-coral/25 pl-3">
                    <div className="text-[11.5px] font-medium text-ink">{item.title}</div>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-faint">{item.desc}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <Info className="h-3 w-3" />
                怎么生效
              </div>
              <ul className="space-y-2 text-[10.5px] leading-5 text-ink-soft">
                <li>· 下一轮对话开始生效，不用重启。</li>
                <li>· 可以写 <code className="rounded bg-ink/5 px-1">{"{name}"}</code> 和 <code className="rounded bg-ink/5 px-1">{"{owner}"}</code>，会自动替换。</li>
                <li>· 她不能改这里；想让她改，要先得到你的同意。</li>
                <li>· 写得太满反而会僵，留一点让她自己长出来的地方。</li>
              </ul>
            </Card>

            <Card className="p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                <Shield className="h-3 w-3" />
                边界
              </div>
              <p className="text-[10.5px] leading-5 text-ink-soft">
                人设是底色，不是剧本。真正的记忆、心情和关系，在别的地方慢慢长。
              </p>
            </Card>

            <div className="flex items-center gap-2 px-1 text-[9px] text-ink-faint">
              <Sparkles className="h-3 w-3 text-gold" />
              改动越少，越像同一个人。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
