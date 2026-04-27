import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  status?: "ok" | "warn" | "crit" | "idle";
  hint?: string;
  sparkline?: number[];
  icon?: ReactNode;
}

const statusColor: Record<NonNullable<Props["status"]>, string> = {
  ok: "var(--neon-green)",
  warn: "var(--neon-amber)",
  crit: "var(--neon-red)",
  idle: "var(--muted-foreground)",
};

export function SignalCard({
  label,
  value,
  unit,
  status = "idle",
  hint,
  sparkline,
  icon,
}: Props) {
  const color = statusColor[status];

  // Build SVG path for sparkline
  let path = "";
  if (sparkline && sparkline.length > 1) {
    const w = 200;
    const h = 36;
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of sparkline) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const range = mx - mn || 1;
    sparkline.forEach((v, i) => {
      const x = (i / (sparkline.length - 1)) * w;
      const y = h - ((v - mn) / range) * h;
      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
  }

  return (
    <div
      className="relative overflow-hidden rounded-md border bg-card/60 p-3 backdrop-blur-sm"
      style={{ borderColor: `color-mix(in oklab, ${color} 40%, transparent)` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {icon}
          {label}
        </div>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color, textShadow: `0 0 8px color-mix(in oklab, ${color} 60%, transparent)` }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <svg viewBox="0 0 200 36" className="mt-2 h-9 w-full" preserveAspectRatio="none">
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
          />
        </svg>
      )}
      {hint && (
        <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}