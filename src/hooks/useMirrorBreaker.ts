import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  TimeSeries,
  EMA,
  estimateDominantFrequency,
  std,
  clamp,
} from "@/lib/mirrorbreaker/signal-utils";
import {
  LEFT_EYE_EAR,
  RIGHT_EYE_EAR,
  FOREHEAD_LANDMARKS,
  eyeAspectRatio,
  landmarksBBox,
  mouthOpenness,
  NOSE_TIP,
  type Pt,
} from "@/lib/mirrorbreaker/landmarks";

export type ThreatLevel = "trusted" | "suspicious" | "deepfake";

export interface AlertEvent {
  id: string;
  ts: number;
  level: "info" | "warn" | "critical";
  code: string;
  message: string;
}

export interface MirrorBreakerSignals {
  initialized: boolean;
  running: boolean;
  faceDetected: boolean;
  fps: number;
  // rPPG
  bpm: number;
  rppgConfidence: number; // 0..1 (SNR-derived)
  rppgWindow: number[]; // last ~256 samples for plotting
  // Blink
  blinkRatePerMin: number;
  earCurrent: number;
  // Lip-sync
  lipSyncDrift: number; // 0..1 (1 = perfect mismatch)
  audioActive: boolean;
  // Composite
  trustScore: number; // 0..100
  threatLevel: ThreatLevel;
  alerts: AlertEvent[];
  // Face overlay
  faceBox: { x: number; y: number; w: number; h: number } | null;
  foreheadBox: { x: number; y: number; w: number; h: number } | null;
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const VISION_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

const RPPG_WINDOW_MS = 10_000; // 10s for HR estimation
const BLINK_WINDOW_MS = 30_000;
const LIPSYNC_WINDOW_MS = 4_000;

import { type TuningConfig, DEFAULT_CONFIG } from "@/components/mirrorbreaker/SettingsModal";

export function useMirrorBreaker(config: TuningConfig = DEFAULT_CONFIG) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Signal buffers
  const greenSeries = useRef(new TimeSeries(RPPG_WINDOW_MS));
  const earSeries = useRef(new TimeSeries(BLINK_WINDOW_MS));
  const mouthSeries = useRef(new TimeSeries(LIPSYNC_WINDOW_MS));
  const audioSeries = useRef(new TimeSeries(LIPSYNC_WINDOW_MS));
  const blinkTimes = useRef<number[]>([]);
  const blinkState = useRef(false);
  const recentEarMax = useRef(0.25); // Dynamic blink baseline
  const fpsEMA = useRef(new EMA(0.1));
  const trustEMA = useRef(new EMA(0.05)); // 0.05 provides extreme temporal stability (anti-jitter)
  const lastFrame = useRef(0);
  
  // Head Pose tracking
  const noseSeriesX = useRef(new TimeSeries(4000));
  const noseSeriesY = useRef(new TimeSeries(4000));
  const alertsRef = useRef<AlertEvent[]>([]);
  const lastAlertTs = useRef<Record<string, number>>({});

  const [signals, setSignals] = useState<MirrorBreakerSignals>({
    initialized: false,
    running: false,
    faceDetected: false,
    fps: 0,
    bpm: 0,
    rppgConfidence: 0,
    rppgWindow: [],
    blinkRatePerMin: 0,
    earCurrent: 0,
    lipSyncDrift: 0,
    audioActive: false,
    trustScore: 100,
    threatLevel: "trusted",
    alerts: [],
    faceBox: null,
    foreheadBox: null,
  });

  const pushAlert = useCallback(
    (level: AlertEvent["level"], code: string, message: string) => {
      const now = performance.now();
      const last = lastAlertTs.current[code] ?? 0;
      if (now - last < 4000) return; // dedupe
      lastAlertTs.current[code] = now;
      const ev: AlertEvent = {
        id: `${code}-${Date.now()}`,
        ts: Date.now(),
        level,
        code,
        message,
      };
      alertsRef.current = [ev, ...alertsRef.current].slice(0, 40);
    },
    [],
  );

  const init = useCallback(async () => {
    if (landmarkerRef.current) return;
    const fileset = await FilesetResolver.forVisionTasks(VISION_WASM);
    landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    setSignals((s) => ({ ...s, initialized: true }));
  }, []);

  const start = useCallback(async () => {
    await init();
    if (!videoRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: true,
    });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    // Audio analyser for lip-sync
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac: AudioContext = new AC();
      audioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      analyserRef.current = an;
    } catch {
      // audio optional
    }

    // sample canvas (offscreen) for forehead pixel reading
    const sc = document.createElement("canvas");
    sc.width = 640;
    sc.height = 480;
    sampleCanvasRef.current = sc;

    setSignals((s) => ({ ...s, running: true }));
    pushAlert("info", "BOOT", "Detection engine online. Calibrating signals…");
    loop();
  }, [init, pushAlert]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    greenSeries.current.clear();
    earSeries.current.clear();
    mouthSeries.current.clear();
    audioSeries.current.clear();
    blinkTimes.current = [];
    recentEarMax.current = 0.25;
    fpsEMA.current.reset();
    trustEMA.current.reset();
    noseSeriesX.current.clear();
    noseSeriesY.current.clear();
    setSignals((s) => ({
      ...s,
      running: false,
      faceDetected: false,
      fps: 0,
      bpm: 0,
      rppgConfidence: 0,
      rppgWindow: [],
      blinkRatePerMin: 0,
      earCurrent: 0,
      lipSyncDrift: 0,
      audioActive: false,
      trustScore: 100,
      threatLevel: "trusted",
      faceBox: null,
      foreheadBox: null,
    }));
  }, []);

  const loop = useCallback(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      const sc = sampleCanvasRef.current;
      const lm = landmarkerRef.current;
      if (!video || !sc || !lm || video.readyState < 2) return;

      const now = performance.now();
      if (lastFrame.current) {
        const dt = now - lastFrame.current;
        if (dt > 0) fpsEMA.current.update(1000 / dt);
      }
      lastFrame.current = now;

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      if (sc.width !== w) sc.width = w;
      if (sc.height !== h) sc.height = h;
      const ctx = sc.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);

      let result: FaceLandmarkerResult | null = null;
      try {
        result = lm.detectForVideo(video, now);
      } catch {
        return;
      }

      const faces = result?.faceLandmarks ?? [];
      const faceDetected = faces.length > 0;

      let foreheadBox: MirrorBreakerSignals["foreheadBox"] = null;
      let faceBox: MirrorBreakerSignals["faceBox"] = null;
      let earCurrent = 0;

      if (faceDetected) {
        const landmarks = faces[0] as Pt[];
        // Face bbox from all landmarks
        let mnX = 1, mnY = 1, mxX = 0, mxY = 0;
        for (const p of landmarks) {
          if (p.x < mnX) mnX = p.x;
          if (p.y < mnY) mnY = p.y;
          if (p.x > mxX) mxX = p.x;
          if (p.y > mxY) mxY = p.y;
        }
        faceBox = {
          x: mnX * w,
          y: mnY * h,
          w: (mxX - mnX) * w,
          h: (mxY - mnY) * h,
        };

        // Forehead patch -> rPPG
        foreheadBox = landmarksBBox(landmarks, FOREHEAD_LANDMARKS, w, h);
        if (foreheadBox && foreheadBox.w > 4 && foreheadBox.h > 4) {
          const img = ctx.getImageData(
            foreheadBox.x,
            foreheadBox.y,
            foreheadBox.w,
            foreheadBox.h,
          );
          let gSum = 0;
          let rSum = 0;
          let bSum = 0;
          const px = img.data.length / 4;
          for (let i = 0; i < img.data.length; i += 4) {
            rSum += img.data[i];
            gSum += img.data[i + 1];
            bSum += img.data[i + 2];
          }
          const rMean = rSum / px;
          const gMean = gSum / px;
          const bMean = bSum / px;
          // CHROM-style chrominance: emphasizes pulsatile component
          const chrom = 3 * rMean - 2 * gMean - (1.5 * gMean + 1.5 * bMean) / 2;
          // Use green-dominant signal — robust default
          const sample = gMean - 0.5 * (rMean + bMean) + chrom * 0.05;
          greenSeries.current.push(sample, now);
        }

        // EAR -> blink
        const earL = eyeAspectRatio(landmarks, LEFT_EYE_EAR);
        const earR = eyeAspectRatio(landmarks, RIGHT_EYE_EAR);
        earCurrent = (earL + earR) / 2;
        earSeries.current.push(earCurrent, now);
        
        // Dynamic Blink Baseline
        if (earCurrent > recentEarMax.current) {
          recentEarMax.current = earCurrent;
        } else {
          recentEarMax.current = recentEarMax.current * 0.999 + earCurrent * 0.001;
        }

        // Blink detection: Dynamic threshold at 75% of resting eye size
        const BLINK_THRESH = recentEarMax.current * 0.75;
        if (!blinkState.current && earCurrent < BLINK_THRESH) {
          blinkState.current = true;
          blinkTimes.current.push(now);
          // prune
          const cutoff = now - BLINK_WINDOW_MS;
          while (blinkTimes.current.length && blinkTimes.current[0] < cutoff) {
            blinkTimes.current.shift();
          }
        } else if (blinkState.current && earCurrent > BLINK_THRESH + 0.02) {
          blinkState.current = false;
        }

        // Mouth openness for lip-sync
        const mouth = mouthOpenness(landmarks);
        mouthSeries.current.push(mouth, now);

        // Head pose tracking (Nose Tip variance)
        noseSeriesX.current.push(landmarks[NOSE_TIP].x, now);
        noseSeriesY.current.push(landmarks[NOSE_TIP].y, now);
      } else {
        // No face — slowly clear blink state
        blinkState.current = false;
      }

      // Audio RMS sample
      let audioActive = false;
      const an = analyserRef.current;
      if (an) {
        const arr = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(arr);
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = (arr[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / arr.length);
        audioSeries.current.push(rms, now);
        audioActive = rms > 0.02;
      }

      // ===== Derive metrics =====

      // rPPG -> BPM
      let bpm = 0;
      let rppgConfidence = 0;
      const gVals = greenSeries.current.getValues();
      const gFs = greenSeries.current.sampleRate();
      if (gVals.length > 90 && gFs > 5) {
        const { freqHz, snr } = estimateDominantFrequency(
          gVals,
          gFs,
          0.7, // 42 bpm
          3.5, // 210 bpm
          80,
        );
        bpm = freqHz * 60;
        rppgConfidence = clamp((snr - 1) / 8, 0, 1);
      }

      // Blink rate per minute (extrapolated from window)
      const blinkWinSec = Math.min(
        BLINK_WINDOW_MS,
        now - (blinkTimes.current[0] ?? now),
      ) / 1000;
      const blinkRatePerMin =
        blinkTimes.current.length > 0 && blinkWinSec > 2
          ? (blinkTimes.current.length / blinkWinSec) * 60
          : 0;

      // Lip-sync drift: when audio is active, mouth movement should correlate with audio RMS.
      let lipSyncDrift = 0;
      const audVals = audioSeries.current.getValues();
      const mouthVals = mouthSeries.current.getValues();
      const audMean = audVals.reduce((s, v) => s + v, 0) / Math.max(1, audVals.length);
      
      if (audMean > 0.03 && audVals.length > 30 && mouthVals.length > 30) {
        // Resample to common length (use min length)
        const N = Math.min(audVals.length, mouthVals.length, 120);
        const a = audVals.slice(-N);
        const m = mouthVals.slice(-N);
        
        const mouthVar = std(m);
        const maxMouth = Math.max(...m);
        
        // Ventriloquist Check: Loud audio but mouth is completely shut
        if (mouthVar < 0.005 && maxMouth < 0.06) {
          lipSyncDrift = 0.95; // Ventriloquist attack!
        } else {
          // Envelope Smoothing
          const aMax = Math.max(...a, 0.001);
          const aNorm = a.map(v => v / aMax);
          
          const mMin = Math.min(...m);
          const mMax = Math.max(...m, mMin + 0.001);
          const mNorm = m.map(v => (v - mMin) / (mMax - mMin));
          
          const smooth = (arr: number[]) => {
            const out = [];
            for (let i = 0; i < arr.length; i++) {
              let sum = 0, count = 0;
              for (let j = Math.max(0, i - 2); j <= Math.min(arr.length - 1, i + 2); j++) {
                sum += arr[j]; count++;
              }
              out.push(sum / count);
            }
            return out;
          };
          
          const aSmooth = smooth(aNorm);
          const mSmooth = smooth(mNorm);
          
          // RMSE between envelopes
          let mse = 0;
          for(let i=0; i<N; i++) {
            const diff = aSmooth[i] - mSmooth[i];
            mse += diff * diff;
          }
          const rmse = Math.sqrt(mse / N);
          
          // If rmse > 0.35, high drift. If rmse < 0.2, perfect sync.
          lipSyncDrift = clamp((rmse - 0.2) * 2.0, 0, 1);
        }
      }

      // ===== Composite trust score =====
      let score = 100;
      const reasons: string[] = [];

      if (!faceDetected) {
        score = trustEMA.current.get() || 50;
      } else {
        // rPPG: low confidence after warmup => suspicious
        if (gVals.length > 150) {
          if (rppgConfidence < config.rppgConfidenceMin) {
            score -= 35;
            reasons.push("rPPG_FLAT");
          } else if (rppgConfidence < config.rppgConfidenceMin * 2) {
            score -= 15;
          }
          if (bpm < 45 || bpm > 180) {
            score -= 10;
          }
        }
        // Blinks: humans blink 12–20 / min normally
        if (earSeries.current.length > 200) {
          if (blinkRatePerMin < config.blinkLowThresh) {
            score -= 25;
            reasons.push("BLINK_LOW");
          } else if (blinkRatePerMin > config.blinkHighThresh) {
            score -= 10;
            reasons.push("BLINK_ERRATIC");
          }
        }
        // Lip sync
        if (lipSyncDrift > config.lipSyncDriftMax) {
          score -= 25;
          reasons.push("LIP_DRIFT");
        } else if (lipSyncDrift > config.lipSyncDriftMax - 0.2) {
          score -= 10;
        }
        // EAR variance: deepfakes often have static eyes
        const earVals = earSeries.current.getValues();
        if (earVals.length > 200) {
          const v = std(earVals);
          if (v < 0.008) {
            score -= 15;
            reasons.push("STATIC_EYES");
          }
        }
        
        // Head Pose Rigidity
        const nx = noseSeriesX.current.getValues();
        const ny = noseSeriesY.current.getValues();
        if (nx.length > 90) {
          const varX = std(nx);
          const varY = std(ny);
          // If the face moves less than 0.05% of the screen width/height over 3 seconds
          if (varX < 0.0005 && varY < 0.0005) {
             score -= 25;
             reasons.push("HEAD_STATIC");
          }
        }
      }
      score = clamp(score, 0, 100);
      const smoothed = trustEMA.current.update(score);
      const threatLevel: ThreatLevel =
        smoothed >= 70 ? "trusted" : smoothed >= 40 ? "suspicious" : "deepfake";

      // Emit alerts based on reasons
      if (reasons.includes("rPPG_FLAT"))
        pushAlert("warn", "RPPG_FLAT", "No facial blood-flow signal detected.");
      if (reasons.includes("BLINK_LOW"))
        pushAlert("warn", "BLINK_LOW", "Abnormally low blink rate.");
      if (reasons.includes("LIP_DRIFT"))
        pushAlert(
          "critical",
          "LIP_DRIFT",
          "Audio/visual lip-sync mismatch detected.",
        );
      if (reasons.includes("STATIC_EYES"))
        pushAlert("warn", "STATIC_EYES", "Eye micro-motion below human baseline.");
      if (reasons.includes("HEAD_STATIC"))
        pushAlert("critical", "HEAD_STATIC", "Unnatural head rigidity detected.");
      if (smoothed < 40)
        pushAlert("critical", "DEEPFAKE", "DEEPFAKE PROBABILITY HIGH.");

      // Window for plotting (downsample to 128)
      const plot = (() => {
        const arr = greenSeries.current.getValues();
        if (arr.length <= 128) return arr.slice();
        const step = arr.length / 128;
        const out: number[] = [];
        for (let i = 0; i < 128; i++) out.push(arr[Math.floor(i * step)]);
        return out;
      })();

      setSignals({
        initialized: true,
        running: true,
        faceDetected,
        fps: fpsEMA.current.get(),
        bpm,
        rppgConfidence,
        rppgWindow: plot,
        blinkRatePerMin,
        earCurrent,
        lipSyncDrift,
        audioActive,
        trustScore: smoothed,
        threatLevel,
        alerts: alertsRef.current.slice(),
        faceBox,
        foreheadBox,
      });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [pushAlert]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      landmarkerRef.current?.close();
    };
  }, []);

  return { videoRef, overlayRef, signals, start, stop };
}