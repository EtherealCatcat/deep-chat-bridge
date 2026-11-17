import { useEffect, useState } from "react";
import {
  CalendarHeart,
  Flame,
  HeartHandshake,
  Milestone,
  Sprout,
  TrendingUp,
} from "lucide-react";
import { api, formatDay } from "../api";
import type { Relationship } from "../types";
import { Card, Loading, SectionTitle } from "./ui";

interface GrowthData {
  relationship: Relationship;
  description: string;
  growth: { label: string; text: string }[];
}

function Meter({ label, value, tone }: { label: string; value: number; tone: "coral" | "sea" }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10.5px] text-ink-soft">{label}</span>
        <span className="font-mono text-[10px] text-ink-faint">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone === "coral" ? "bg-coral" : "bg-sea"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function GrowthView({ showToast }: { showToast: (text: string, kind?: "info" | "error") => void }) {
  const [data, setData] = useState<GrowthData | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .relationship()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "读取关系失败。", "error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8">
        <SectionTitle eyebrow="GROWTH" title="成长" desc="关系不是数值，但数值会记得。" />
        <Loading label="正在数日子…" />
      </div>
    );
  }

  const { relationship, description } = data;
  const milestones = [...relationship.milestones].reverse();

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8">
      <SectionTitle eyebrow="GROWTH" title="成长" desc="她和你之间，慢慢攒下来的东西。" />

      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-coral/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-gold">
              <Sprout className="h-3 w-3" />
              认识
            </div>
            <div className="flex items-baseline gap-2">
              <span className="serif text-[58px] font-semibold leading-none tracking-tight text-ink">
                {relationship.daysKnown ?? 1}
              </span>
              <span className="text-[13px] text-ink-soft">天</span>
            </div>
            <p className="mt-2 max-w-lg text-[11.5px] leading-6 text-ink-soft">{description}</p>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="h-3 w-3 text-coral" />
              连续 {relationship.streak} 天
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarHeart className="h-3 w-3 text-sea" />
              从 {formatDay(relationship.firstMet)}
            </span>
          </div>
        </div>

        <div className="relative mt-7 grid gap-5 border-t border-line/50 pt-5 sm:grid-cols-2">
          <Meter label="信任" value={relationship.trust} tone="sea" />
          <Meter label="亲密" value={relationship.intimacy} tone="coral" />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <Milestone className="h-3 w-3" />
              记号
            </div>
            <span className="text-[9.5px] text-ink-faint">{milestones.length} 个</span>
          </div>
          {milestones.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-ink-faint">还没有记号。日子还长。</p>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute bottom-2 left-[5px] top-2 w-px bg-line/70" />
              {milestones.map((item, index) => (
                <div key={`${item.date}-${index}`} className="relative flex gap-4 pb-5 last:pb-0">
                  <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-coral/60 bg-paper" />
                  <div className="min-w-0">
                    <div className="text-[12px] leading-5 text-ink">{item.text}</div>
                    <div className="mt-0.5 text-[9.5px] text-ink-faint">{item.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <HeartHandshake className="h-3 w-3" />
              怎么长
            </div>
            <ul className="space-y-2.5 text-[10.5px] leading-5 text-ink-soft">
              <li>· 聊过的话、写下的日记、夜里整理出的记忆，都会留下痕迹。</li>
              <li>· 信任和亲密不是任务奖励，是一次次没有被辜负攒出来的。</li>
              <li>· 长时间不联系会慢慢回落，但不会清零。</li>
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <TrendingUp className="h-3 w-3" />
              最近
            </div>
            <div className="space-y-2">
              {data.growth.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-[10.5px]">
                  <span className="text-ink-faint">{item.label}</span>
                  <span className="text-ink-soft">{item.text}</span>
                </div>
              ))}
            </div>
          </Card>

          <p className="px-1 text-[9px] leading-4 text-ink-faint">
            这些数字只给她自己看，不参与「表现好就加分」。
          </p>
        </div>
      </div>
    </div>
  );
}
