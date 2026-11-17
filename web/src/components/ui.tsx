import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function WhaleAvatar({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[15px]",
    md: "h-10 w-10 text-[19px]",
    lg: "h-14 w-14 text-[27px]",
    xl: "h-24 w-24 text-[46px]",
  };
  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6f968e] via-[#527a73] to-[#365650] shadow-[inset_0_1px_1px_rgba(255,255,255,.28),0_5px_14px_rgba(53,83,77,.2)] ring-1 ring-white/40 ${sizes[size]} ${className}`}
      aria-hidden
    >
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,.18)]">🐋</span>
      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#f6d9a8] ring-2 ring-[#f2e9dc]" />
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`paper-card ${className}`}>{children}</section>;
}

export function SectionTitle({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-coral/80">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2>
        {desc ? <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">{desc}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "sea" | "coral" | "gold";
  className?: string;
}) {
  const tones = {
    neutral: "border-line/80 bg-white/45 text-ink-soft",
    sea: "border-sea/25 bg-sea/10 text-sea-deep",
    coral: "border-coral/25 bg-coral/10 text-coral-deep",
    gold: "border-gold/25 bg-gold/10 text-[#8a6a2f]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Loading({ label = "正在翻开这一页…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-16 text-[13px] text-ink-soft">
      <LoaderCircle className="h-4 w-4 animate-spin text-coral/70" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line/80 px-8 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/45 text-coral/70">
        {icon}
      </div>
      <h3 className="serif text-lg text-ink">{title}</h3>
      {desc ? <p className="mt-2 max-w-sm text-[13px] leading-6 text-ink-soft">{desc}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {hint ? <span className="text-[10.5px] text-ink-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Divider() {
  return <div className="my-6 h-px bg-line/60" />;
}
