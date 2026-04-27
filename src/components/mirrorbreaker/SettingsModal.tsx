import { Settings2, X } from "lucide-react";
import { useState } from "react";

export interface TuningConfig {
  blinkLowThresh: number;
  blinkHighThresh: number;
  lipSyncDriftMax: number;
  rppgConfidenceMin: number;
}

export const DEFAULT_CONFIG: TuningConfig = {
  blinkLowThresh: 4,
  blinkHighThresh: 45,
  lipSyncDriftMax: 0.55,
  rppgConfidenceMin: 0.15,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TuningConfig;
  onSave: (config: TuningConfig) => void;
}

export function SettingsModal({ open, onOpenChange, config, onSave }: Props) {
  const [draft, setDraft] = useState<TuningConfig>(config);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg shadow-black/50">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="mb-6 flex items-center gap-2 text-glow-cyan text-accent">
          <Settings2 className="h-5 w-5" />
          <h2 className="text-lg font-bold uppercase tracking-widest">
            Tuning Parameters
          </h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Min Blink Rate (/min)
            </label>
            <input
              type="number"
              value={draft.blinkLowThresh}
              onChange={(e) =>
                setDraft({ ...draft, blinkLowThresh: Number(e.target.value) })
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Triggers alert if blink rate falls below this (Default: 4).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Max Blink Rate (/min)
            </label>
            <input
              type="number"
              value={draft.blinkHighThresh}
              onChange={(e) =>
                setDraft({ ...draft, blinkHighThresh: Number(e.target.value) })
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Triggers alert if blink rate exceeds this (Default: 45).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Lip-Sync Drift Threshold (0-1)
            </label>
            <input
              type="number"
              step="0.05"
              value={draft.lipSyncDriftMax}
              onChange={(e) =>
                setDraft({ ...draft, lipSyncDriftMax: Number(e.target.value) })
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Tolerance for audio-visual mismatch (Default: 0.55).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              rPPG Confidence Min (0-1)
            </label>
            <input
              type="number"
              step="0.05"
              value={draft.rppgConfidenceMin}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  rppgConfidenceMin: Number(e.target.value),
                })
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Minimum confidence for facial blood flow signal (Default: 0.15).
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              setDraft(DEFAULT_CONFIG);
            }}
            className="rounded-md border px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted"
          >
            Reset
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
            className="rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-neon-green transition hover:bg-primary/90"
          >
            Save Parameters
          </button>
        </div>
      </div>
    </div>
  );
}
