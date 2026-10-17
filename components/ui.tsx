import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "neutral" | "ok" | "bad" | "warn" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  ok: "bg-ok-bg text-ok",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-medium tracking-wide ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel panel-hover spot p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <p className="eyebrow mb-3 inline-flex items-center gap-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
          Agent Ledger
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
      <span className="text-sweep">{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad">
      <p className="font-medium">Couldn&apos;t load this data.</p>
      <p className="mt-1 font-mono text-xs">{error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

const STAT_TONE: Record<"neutral" | "ok" | "bad" | "warn" | "info", { text: string; glow: string; bar: string }> = {
  neutral: { text: "text-text", glow: "rgb(255 255 255 / 0.06)", bar: "bg-muted" },
  ok: { text: "text-ok", glow: "rgb(0 185 126 / 0.16)", bar: "bg-ok" },
  bad: { text: "text-bad", glow: "rgb(236 134 116 / 0.16)", bar: "bg-bad" },
  warn: { text: "text-warn", glow: "rgb(231 182 67 / 0.15)", bar: "bg-warn" },
  info: { text: "text-info", glow: "rgb(132 189 209 / 0.16)", bar: "bg-info" },
};

/** KPI tile. `fill` (0–1) draws a thin progress bar along the bottom edge. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  fill,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof STAT_TONE;
  fill?: number | null;
  delay?: number;
}) {
  const t = STAT_TONE[tone];
  return (
    <div
      className="panel panel-hover tile spot fade-up overflow-hidden p-5"
      style={{ "--tile-glow": t.glow, "--d": `${delay}s` } as React.CSSProperties}
    >
      <p className="relative font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`relative mt-3 text-4xl font-semibold tabular-nums tracking-[-0.03em] ${t.text}`}>{value}</p>
      {hint && <p className="relative mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
      {typeof fill === "number" && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-border">
          <div
            className={`bar-x h-full ${t.bar}`}
            style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, "--d": `${0.3 + delay}s` } as React.CSSProperties}
          />
        </div>
      )}
    </div>
  );
}

export function RunLink({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <Link href={`/runs/${encodeURIComponent(id)}`} className="font-mono text-accent underline-offset-4 hover:text-accent-hover hover:underline">
      {children ?? id.slice(0, 8)}
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
