import Link from "next/link";

export type StatusTone = "normal" | "warning" | "critical" | "offline" | "info";

export const TONE_COLORS: Record<StatusTone, string> = {
  normal: "#22c55e",
  warning: "#f5a524",
  critical: "#ef4444",
  offline: "#64748b",
  info: "#38bdf8",
};

export function statusTone(status: string): StatusTone {
  if (status === "normal" || status === "online") return "normal";
  if (status === "warning" || status === "stale") return "warning";
  if (status === "critical") return "critical";
  return "offline";
}

export function StatusDot({ tone, pulse = false, size = 10 }: { tone: StatusTone; pulse?: boolean; size?: number }) {
  const color = TONE_COLORS[tone];
  return (
    <span
      className={`inline-block rounded-full ${pulse ? "ms-pulse" : ""}`}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 8px ${color}` }}
      aria-hidden
    />
  );
}

export function Pill({
  tone = "info",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const color = TONE_COLORS[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color, borderColor: `${color}55`, background: `${color}18` }}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const Tag = as;
  return <Tag className={`ms-card p-3.5 ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  title,
  action,
  hint,
}: {
  title: string;
  action?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2 mt-5 flex items-end justify-between gap-3 first:mt-0">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-[var(--text)]">{title}</h2>
        {hint ? <p className="ms-muted text-[11px]">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  unit,
  tone = "info",
  hint,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: StatusTone;
  hint?: string;
  href?: string;
  icon?: string;
}) {
  const color = TONE_COLORS[tone];
  const body = (
    <div className="ms-card flex h-full flex-col gap-1 p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="ms-label">{label}</span>
        {icon ? <span className="text-base leading-none">{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="ms-mono text-2xl font-bold" style={{ color }}>
          {value}
        </span>
        {unit ? <span className="ms-muted text-xs font-medium">{unit}</span> : null}
      </div>
      {hint ? <span className="ms-muted text-[11px] leading-snug">{hint}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Semi-circular SVG gauge used for gas / temperature / battery readings. */
export function Gauge({
  value,
  min,
  max,
  label,
  unit,
  tone,
  threshold,
  size = 132,
}: {
  value: number | null;
  min: number;
  max: number;
  label: string;
  unit: string;
  tone: StatusTone;
  threshold?: number | null;
  size?: number;
}) {
  const clamped = value === null ? 0 : Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min || 1);
  const radius = size / 2 - 12;
  const circumference = Math.PI * radius;
  const dash = circumference * ratio;
  const color = TONE_COLORS[tone];
  const thresholdRatio = threshold === null || threshold === undefined ? null : Math.max(0, Math.min(1, (threshold - min) / (max - min || 1)));

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 1.7} viewBox={`0 0 ${size} ${size / 1.7}`} role="img" aria-label={`${label}: ${value ?? "no data"} ${unit}`}>
        <path
          d={`M 12 ${size / 2 - 4} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2 - 4}`}
          fill="none"
          stroke="#1b2740"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M 12 ${size / 2 - 4} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2 - 4}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.3s ease" }}
        />
        {thresholdRatio !== null ? (
          <line
            x1={12 + thresholdRatio * radius * 1}
            y1={size / 2 - 4}
            x2={12 + thresholdRatio * radius}
            y2={size / 2 - 4}
            stroke="#e8eef8"
            strokeOpacity="0.55"
            strokeWidth="2"
          />
        ) : null}
        <text x={size / 2} y={size / 2 - 12} textAnchor="middle" className="ms-mono" fill="#e8eef8" fontSize="20" fontWeight="700">
          {value === null ? "--" : value.toFixed(value < 10 ? 2 : 0)}
        </text>
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill="#93a4bd" fontSize="10">
          {unit}
        </text>
      </svg>
      <span className="ms-label mt-1">{label}</span>
    </div>
  );
}

/** Compact SVG trend line. Values above `warnAt`/`critAt` change the stroke colour. */
export function Sparkline({
  values,
  height = 46,
  tone = "info",
  warnAt,
  critAt,
  label,
}: {
  values: (number | null)[];
  height?: number;
  tone?: StatusTone;
  warnAt?: number;
  critAt?: number;
  label: string;
}) {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const width = 240;
  if (clean.length < 2) {
    return (
      <div className="ms-muted flex h-[46px] items-center justify-center text-[11px]" aria-label={label}>
        Collecting samples…
      </div>
    );
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const points = clean
    .map((v, i) => {
      const x = (i / (clean.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = clean[clean.length - 1];
  const strokeColor = critAt !== undefined && last >= critAt ? TONE_COLORS.critical : warnAt !== undefined && last >= warnAt ? TONE_COLORS.warning : TONE_COLORS[tone];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      {critAt !== undefined && critAt >= min && critAt <= max ? (
        <line x1="0" x2={width} y1={height - ((critAt - min) / span) * (height - 6) - 3} y2={height - ((critAt - min) / span) * (height - 6) - 3} stroke="#ef4444" strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
      ) : null}
      {warnAt !== undefined && warnAt >= min && warnAt <= max ? (
        <line x1="0" x2={width} y1={height - ((warnAt - min) / span) * (height - 6) - 3} y2={height - ((warnAt - min) / span) * (height - 6) - 3} stroke="#f5a524" strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
      ) : null}
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BarChart({ data }: { data: { label: string; value: number; tone?: StatusTone }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <EmptyState title="No data" message="No alert activity in this period." />;
  return (
    <div className="flex h-32 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 4 : 2,
                background: TONE_COLORS[d.tone ?? "info"],
                opacity: d.value > 0 ? 0.9 : 0.25,
              }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="ms-muted text-[9px]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, message, icon = "📭" }: { title: string; message: string; icon?: string }) {
  return (
    <div className="ms-card-flat flex flex-col items-center gap-1.5 px-4 py-8 text-center">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="ms-muted text-xs">{message}</p>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]"
        aria-hidden
      />
      <span className="ms-muted">{label}…</span>
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--crit)] bg-[rgba(239,68,68,0.12)] p-3 text-xs text-[color:var(--crit)]" role="alert">
      {message}
    </div>
  );
}

export function SimulatedBadge({ source }: { source?: string | null }) {
  if (source === "device") {
    return <Pill tone="normal">📡 Device data</Pill>;
  }
  return <Pill tone="info">🧪 Simulated data</Pill>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
