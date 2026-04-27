import { useEffect, useRef } from "react";
import type { AlertEvent } from "@/hooks/useMirrorBreaker";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

interface Props {
  alerts: AlertEvent[];
}

const levelMeta = {
  info: { color: "var(--neon-cyan)", icon: Info },
  warn: { color: "var(--neon-amber)", icon: AlertTriangle },
  critical: { color: "var(--neon-red)", icon: ShieldAlert },
} as const;

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function AlertConsole({ alerts }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [alerts.length]);

  return (
    <div className="flex h-full flex-col rounded-md border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Threat Console
        </div>
        <div className="text-[10px] text-muted-foreground">
          {alerts.length} events
        </div>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        {alerts.length === 0 ? (
          <div className="px-2 py-4 text-muted-foreground">
            <span className="animate-pulse-glow">▸</span> Awaiting signal…
          </div>
        ) : (
          alerts.map((a) => {
            const meta = levelMeta[a.level];
            const Icon = meta.icon;
            return (
              <div
                key={a.id}
                className="flex items-start gap-2 border-l-2 px-2 py-1.5"
                style={{ borderColor: meta.color }}
              >
                <Icon
                  className="mt-0.5 h-3 w-3 shrink-0"
                  style={{ color: meta.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="tabular-nums">{fmt(a.ts)}</span>
                    <span
                      className="text-[9px] uppercase tracking-wider"
                      style={{ color: meta.color }}
                    >
                      {a.code}
                    </span>
                  </div>
                  <div className="text-foreground/90">{a.message}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}