import type { MirrorBreakerSignals } from "@/hooks/useMirrorBreaker";

interface Props {
  signals: MirrorBreakerSignals;
}

export function TrustGauge({ signals }: Props) {
  const score = Math.round(signals.trustScore);
  const color =
    signals.threatLevel === "trusted"
      ? "var(--neon-green)"
      : signals.threatLevel === "suspicious"
        ? "var(--neon-amber)"
        : "var(--neon-red)";

  // Half-donut gauge: 180° arc
  const r = 90;
  const cx = 110;
  const cy = 110;
  const circumference = Math.PI * r;
  const dash = (score / 100) * circumference;

  const labelClass =
    signals.threatLevel === "trusted"
      ? "text-glow-green"
      : signals.threatLevel === "suspicious"
        ? "text-glow-amber"
        : "text-glow-red animate-pulse-glow";

  const labelText =
    signals.threatLevel === "trusted"
      ? "TRUSTED"
      : signals.threatLevel === "suspicious"
        ? "SUSPICIOUS"
        : "DEEPFAKE";

  return (
    <div className="flex flex-col items-center">
      <svg width={220} height={130} viewBox="0 0 220 130">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.68 0.26 22)" />
            <stop offset="50%" stopColor="oklch(0.82 0.18 75)" />
            <stop offset="100%" stopColor="oklch(0.85 0.22 150)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="oklch(0.30 0.04 220 / 0.4)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: "stroke-dasharray 0.4s ease-out",
          }}
        />
        {/* Tick marks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = Math.PI - (i / 10) * Math.PI;
          const x1 = cx + Math.cos(a) * (r + 10);
          const y1 = cy - Math.sin(a) * (r + 10);
          const x2 = cx + Math.cos(a) * (r + 16);
          const y2 = cy - Math.sin(a) * (r + 16);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="oklch(0.55 0.04 200 / 0.5)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="-mt-12 text-center">
        <div
          className={`text-5xl font-bold tabular-nums ${labelClass}`}
          style={{ color }}
        >
          {score}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Trust Index
        </div>
        <div className={`mt-2 text-sm font-bold tracking-widest ${labelClass}`} style={{ color }}>
          {labelText}
        </div>
      </div>
    </div>
  );
}