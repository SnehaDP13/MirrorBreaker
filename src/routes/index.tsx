import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  Eye,
  HeartPulse,
  Mic,
  Power,
  ShieldCheck,
  Volume2,
  Zap,
} from "lucide-react";
import { useMirrorBreaker } from "@/hooks/useMirrorBreaker";
import { VideoFeed } from "@/components/mirrorbreaker/VideoFeed";
import { TrustGauge } from "@/components/mirrorbreaker/TrustGauge";
import { SignalCard } from "@/components/mirrorbreaker/SignalCard";
import { AlertConsole } from "@/components/mirrorbreaker/AlertConsole";
import { SettingsModal, type TuningConfig, DEFAULT_CONFIG } from "@/components/mirrorbreaker/SettingsModal";
import { Download, Settings2 } from "lucide-react";
import { type AlertEvent } from "@/hooks/useMirrorBreaker";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MirrorBreaker — Real-time Deepfake Defense" },
      {
        name: "description",
        content:
          "On-device deepfake detection. Catches CEO-fraud video calls in under 200ms using rPPG, micro-blink and lip-sync analysis.",
      },
      { property: "og:title", content: "MirrorBreaker" },
      {
        property: "og:description",
        content: "Stop real-time deepfake CEO fraud dead in its tracks.",
      },
    ],
  }),
});

function Index() {
  const [config, setConfig] = useState<TuningConfig>(() => {
    try {
      const saved = localStorage.getItem("mb-tuning");
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const { videoRef, signals, start, stop } = useMirrorBreaker(config);
  const [error, setError] = useState<string | null>(null);
  const [uptime, setUptime] = useState(0);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allAlerts, setAllAlerts] = useState<AlertEvent[]>([]);
  const [maxThreat, setMaxThreat] = useState<number>(0);

  useEffect(() => {
    if (!signals.running) return;
    setAllAlerts((prev) => {
      const newAlerts = signals.alerts.filter((a) => !prev.some((p) => p.id === a.id));
      if (newAlerts.length === 0) return prev;
      return [...prev, ...newAlerts.reverse()];
    });
  }, [signals.alerts, signals.running]);

  useEffect(() => {
    if (!signals.running) return;
    let v = 0;
    if (signals.threatLevel === "trusted") v = 0;
    else if (signals.threatLevel === "suspicious") v = 1;
    else if (signals.threatLevel === "deepfake") v = 2;
    setMaxThreat((prev) => Math.max(prev, v));
  }, [signals.threatLevel, signals.running]);

  const handleStart = async () => {
    setError(null);
    setAllAlerts([]);
    setMaxThreat(0);
    try {
      await start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start";
      setError(msg);
    }
  };

  const handleExport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      durationSeconds: Math.floor(uptime / 1000),
      maxThreatLevel: maxThreat === 2 ? "DEEPFAKE" : maxThreat === 1 ? "SUSPICIOUS" : "TRUSTED",
      alerts: allAlerts.map(a => ({
        time: new Date(a.ts).toISOString(),
        level: a.level,
        code: a.code,
        message: a.message
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mirrorbreaker-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveConfig = (newConfig: TuningConfig) => {
    setConfig(newConfig);
    localStorage.setItem("mb-tuning", JSON.stringify(newConfig));
  };

  useEffect(() => {
    if (!signals.running) {
      setUptime(0);
      return;
    }
    const startTs = Date.now();
    const id = setInterval(() => setUptime(Date.now() - startTs), 1000);
    return () => clearInterval(id);
  }, [signals.running]);



  const fmtUp = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  const bpmStatus =
    signals.rppgConfidence > 0.3 && signals.bpm > 45 && signals.bpm < 180
      ? "ok"
      : signals.running && signals.rppgWindow.length > 50
        ? "warn"
        : "idle";

  const blinkStatus = !signals.running
    ? "idle"
    : signals.blinkRatePerMin === 0
      ? "idle"
      : signals.blinkRatePerMin < 4
        ? "crit"
        : signals.blinkRatePerMin > 45
          ? "warn"
          : "ok";

  const lipStatus = !signals.audioActive
    ? "idle"
    : signals.lipSyncDrift > 0.55
      ? "crit"
      : signals.lipSyncDrift > 0.35
        ? "warn"
        : "ok";

  const earStatus = signals.faceDetected ? "ok" : "idle";

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <header className="border-b bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShieldCheck className="h-7 w-7 text-primary text-glow-green" />
              {signals.threatLevel === "deepfake" && (
                <span className="absolute -right-1 -top-1 h-2 w-2 animate-blink-warn rounded-full bg-destructive shadow-neon-red" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-glow-green">
                MIRROR<span className="text-accent text-glow-cyan">BREAKER</span>
              </h1>
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                On-device deepfake detection · v1.0
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">

            <div className="hidden md:block">
              <span className="text-primary text-glow-green">●</span> SECURE_CHANNEL
            </div>
            <div className="hidden md:block">UPTIME {fmtUp(uptime)}</div>
            <div>
              {new Date().toLocaleDateString("en-GB", {
                year: "numeric",
                month: "short",
                day: "2-digit",
              })}
            </div>
          </div>
        </div>
      </header>

      <SettingsModal 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen} 
        config={config} 
        onSave={handleSaveConfig} 
      />

      {/* Body grid */}
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* LEFT — Video + controls (cols 1-7) */}
          <section className="lg:col-span-7">
            <div className="rounded-lg border bg-card/40 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="text-sm uppercase tracking-[0.25em] text-foreground">
                    Live Threat Analysis
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="flex items-center gap-2 rounded-md border border-primary/40 bg-card/40 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground transition hover:bg-primary/20 hover:text-primary"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Settings</span>
                  </button>

                  <button
                    onClick={handleExport}
                    disabled={allAlerts.length === 0 && !signals.running}
                    className="flex items-center gap-2 rounded-md border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent transition hover:bg-accent/25 hover:shadow-neon-cyan disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                  {!signals.running ? (
                    <button
                      onClick={handleStart}
                      className="flex items-center gap-2 rounded-md border border-primary/60 bg-primary/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary transition hover:bg-primary/25 hover:shadow-neon-green text-glow-green"
                    >
                      <Power className="h-3.5 w-3.5" />
                      Engage
                    </button>
                  ) : (
                    <button
                      onClick={stop}
                      className="flex items-center gap-2 rounded-md border border-destructive/60 bg-destructive/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-destructive transition hover:bg-destructive/25"
                    >
                      <Power className="h-3.5 w-3.5" />
                      Disengage
                    </button>
                  )}
                </div>
              </div>

              <VideoFeed videoRef={videoRef} signals={signals} />

              {!signals.running && (
                <div className="mt-4 rounded-md border border-dashed border-border/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {signals.initialized
                      ? "Engine loaded. Press ENGAGE to start the live analysis."
                      : "Press ENGAGE — we'll request your camera & mic, load the on-device face mesh model, and begin physiological signal extraction."}
                  </p>
                  {error && (
                    <p className="mt-2 text-xs text-destructive text-glow-red">
                      ⚠ {error}
                    </p>
                  )}
                </div>
              )}

              {signals.running && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SignalCard
                    icon={<HeartPulse className="h-3 w-3" />}
                    label="rPPG Pulse"
                    value={
                      signals.bpm && signals.rppgConfidence > 0.15
                        ? Math.round(signals.bpm)
                        : "––"
                    }
                    unit="bpm"
                    status={bpmStatus}
                    sparkline={signals.rppgWindow}
                    hint={`Conf ${Math.round(signals.rppgConfidence * 100)}%`}
                  />
                  <SignalCard
                    icon={<Eye className="h-3 w-3" />}
                    label="Blink Rate"
                    value={
                      signals.blinkRatePerMin > 0
                        ? signals.blinkRatePerMin.toFixed(1)
                        : "––"
                    }
                    unit="/min"
                    status={blinkStatus}
                    hint="Human baseline 12–20"
                  />
                  <SignalCard
                    icon={<Mic className="h-3 w-3" />}
                    label="Lip-Sync Drift"
                    value={`${Math.round(signals.lipSyncDrift * 100)}`}
                    unit="%"
                    status={lipStatus}
                    hint={signals.audioActive ? "Voice active" : "Silent"}
                  />
                  <SignalCard
                    icon={<Zap className="h-3 w-3" />}
                    label="EAR"
                    value={signals.earCurrent.toFixed(3)}
                    status={earStatus}
                    hint="Eye Aspect Ratio"
                  />
                </div>
              )}
            </div>

            {/* Tech strip */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-widest text-muted-foreground sm:grid-cols-4">
              <div className="rounded-md border bg-card/40 px-3 py-2">
                <div className="text-primary text-glow-green">▸ ENGINE</div>
                MediaPipe FaceLandmarker
              </div>
              <div className="rounded-md border bg-card/40 px-3 py-2">
                <div className="text-primary text-glow-green">▸ rPPG</div>
                CHROM + Goertzel FFT
              </div>
              <div className="rounded-md border bg-card/40 px-3 py-2">
                <div className="text-primary text-glow-green">▸ AUDIO</div>
                Web Audio · 1024 FFT
              </div>
              <div className="rounded-md border bg-card/40 px-3 py-2">
                <div className="text-primary text-glow-green">▸ INFERENCE</div>
                100% On-device · 0 cloud
              </div>
            </div>
          </section>

          {/* RIGHT — Trust + Console (cols 8-12) */}
          <aside className="space-y-4 lg:col-span-5">
            <div className="rounded-lg border bg-card/40 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm uppercase tracking-[0.25em]">
                  Trust Index
                </h2>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live
                </div>
              </div>
              <TrustGauge signals={signals} />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-widest">
                <div className="rounded border border-border/50 py-1">
                  <div className="text-glow-green text-primary">0–39</div>
                  <div className="text-muted-foreground">Deepfake</div>
                </div>
                <div className="rounded border border-border/50 py-1">
                  <div className="text-glow-amber" style={{ color: "var(--neon-amber)" }}>
                    40–69
                  </div>
                  <div className="text-muted-foreground">Suspicious</div>
                </div>
                <div className="rounded border border-border/50 py-1">
                  <div className="text-glow-green" style={{ color: "var(--neon-green)" }}>
                    70–100
                  </div>
                  <div className="text-muted-foreground">Trusted</div>
                </div>
              </div>
            </div>

            <div className="h-[420px]">
              <AlertConsole alerts={signals.alerts} />
            </div>

            <div className="rounded-lg border bg-card/40 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Volume2 className="h-3 w-3 text-accent" />
                Operational guidance
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/80">
                For best results, use a well-lit face, hold still for 5–10s
                while the rPPG signal locks. Speak naturally to test lip-sync.
                A live human typically shows BPM 60–100, blinks 12–20×/min and
                tight audio↔mouth correlation.
              </p>
            </div>
          </aside>
        </div>

        {/* Ticker */}
        <div className="mt-6 overflow-hidden rounded-md border bg-card/40 py-2">
          <div className="flex whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="px-8">
              <span className="text-primary text-glow-green">▸ </span>
              Browser-native real-time deepfake detection · sub-200ms latency
            </span>
            <span className="px-8">
              <span className="text-accent text-glow-cyan">▸ </span>
              rPPG: facial blood flow at 0.7–3.5 Hz band
            </span>
            <span className="px-8">
              <span style={{ color: "var(--neon-amber)" }} className="text-glow-amber">
                ▸{" "}
              </span>
              EAR-based micro-blink state machine
            </span>
            <span className="px-8">
              <span style={{ color: "var(--neon-red)" }} className="text-glow-red">
                ▸{" "}
              </span>
              Audio-visual lip-sync cross-correlation
            </span>
            <span className="px-8">
              <span className="text-primary text-glow-green">▸ </span>
              Zero data leaves your device
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
