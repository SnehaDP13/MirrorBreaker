import { useEffect, useRef } from "react";
import type { MirrorBreakerSignals } from "@/hooks/useMirrorBreaker";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  signals: MirrorBreakerSignals;
}

/**
 * Live webcam feed with face/forehead overlays drawn on a canvas
 * sized to the video's intrinsic dimensions.
 */
export function VideoFeed({ videoRef, signals }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!signals.faceBox) return;

    const color =
      signals.threatLevel === "trusted"
        ? "#3df58c"
        : signals.threatLevel === "suspicious"
          ? "#f5c34c"
          : "#ff4d5e";

    // Face bounding box with corner brackets
    const { x, y, w: bw, h: bh } = signals.faceBox;
    const corner = Math.min(bw, bh) * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const drawCorner = (cx: number, cy: number, dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * corner, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * corner);
      ctx.stroke();
    };
    drawCorner(x, y, 1, 1);
    drawCorner(x + bw, y, -1, 1);
    drawCorner(x, y + bh, 1, -1);
    drawCorner(x + bw, y + bh, -1, -1);

    // Forehead ROI
    if (signals.foreheadBox) {
      const f = signals.foreheadBox;
      ctx.strokeStyle = "#82e6ff";
      ctx.shadowColor = "#82e6ff";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(f.x, f.y, f.w, f.h);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#82e6ff";
      ctx.font = "11px monospace";
      ctx.fillText("rPPG ROI", f.x, f.y - 4);
    }

    // Status label
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = "bold 13px monospace";
    const label =
      signals.threatLevel === "trusted"
        ? "● LIVE HUMAN"
        : signals.threatLevel === "suspicious"
          ? "● ANOMALY"
          : "● DEEPFAKE";
    ctx.fillText(label, x, y + bh + 18);
  }, [signals, videoRef]);

  const borderColor =
    signals.threatLevel === "trusted"
      ? "var(--neon-green)"
      : signals.threatLevel === "suspicious"
        ? "var(--neon-amber)"
        : "var(--neon-red)";

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border-2 bg-black scan-lines"
      style={{
        borderColor,
        boxShadow: `0 0 32px ${borderColor.replace("var(", "color-mix(in oklab, var(").replace(")", ") 40%, transparent)")}`,
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full -scale-x-100 object-cover"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
      />
      {/* Sweeping scan line */}
      {signals.running && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute left-0 right-0 h-[2px] animate-scan-sweep"
            style={{
              background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)`,
              boxShadow: `0 0 20px ${borderColor}`,
            }}
          />
        </div>
      )}
      {/* HUD corners */}
      <div className="pointer-events-none absolute left-2 top-2 font-mono text-[10px] uppercase tracking-widest text-primary/80">
        CAM_01 · {Math.round(signals.fps)} FPS
      </div>
      <div className="pointer-events-none absolute right-2 top-2 font-mono text-[10px] uppercase tracking-widest text-primary/80">
        {signals.faceDetected ? "TARGET LOCKED" : "SEARCHING…"}
      </div>
    </div>
  );
}