import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  TimeSeries,
  EMA,
  estimateDominantFrequency,
  clamp,
  std,
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

const RPPG_WINDOW_MS = 10_000;
const BLINK_WINDOW_MS = 30_000;
const LIPSYNC_WINDOW_MS = 4_000;

let landmarker: FaceLandmarker | null = null;
const greenSeries = new TimeSeries(RPPG_WINDOW_MS);
const earSeries = new TimeSeries(BLINK_WINDOW_MS);
const mouthSeries = new TimeSeries(LIPSYNC_WINDOW_MS);
const audioSeries = new TimeSeries(LIPSYNC_WINDOW_MS);

let blinkTimes: number[] = [];
let blinkState = false;
let recentEarMax = 0.25;
const trustEMA = new EMA(0.18); // Faster reaction (~200ms at 30fps)

const noseSeriesX = new TimeSeries(4000);
const noseSeriesY = new TimeSeries(4000);

// Audio State (Local Mic)
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let audioDataArray: Uint8Array | null = null;

// Session State
let isProcessing = false;
const sessionStartTime = Date.now();
let maxThreatScore = 0;
let allAlerts: any[] = [];
let lastAlertTs: Record<string, number> = {};

// Config State
let config = {
  blinkLowThresh: 4,
  blinkHighThresh: 45,
  lipSyncDriftMax: 0.55,
  rppgConfidenceMin: 0.15,
};
try {
  const saved = localStorage.getItem("mb-ext-config");
  if (saved) config = JSON.parse(saved);
} catch {}

// DOM Elements
const statusEl = document.getElementById("mb-status");
const bpmEl = document.getElementById("mb-bpm");
const blinkEl = document.getElementById("mb-blink");
const lipSyncEl = document.getElementById("mb-lipsync");
const barEl = document.getElementById("mb-trust-bar");
const errContainer = document.getElementById("error-container");
const alertsFeed = document.getElementById("alerts-feed");

// Settings DOM
const settingsPanel = document.getElementById("settings-panel");
const btnSettings = document.getElementById("btn-settings");
const btnSettingsCancel = document.getElementById("btn-settings-cancel");
const btnSettingsSave = document.getElementById("btn-settings-save");
const btnExport = document.getElementById("btn-export");

const inpBlinkLow = document.getElementById("cfg-blink-low") as HTMLInputElement;
const inpBlinkHigh = document.getElementById("cfg-blink-high") as HTMLInputElement;
const inpLipSync = document.getElementById("cfg-lipsync") as HTMLInputElement;
const inpRppg = document.getElementById("cfg-rppg") as HTMLInputElement;

function pushAlert(level: "info" | "warn" | "critical", code: string, message: string) {
  const now = performance.now();
  const last = lastAlertTs[code] ?? 0;
  if (now - last < 4000) return;
  lastAlertTs[code] = now;
  
  const alert = { time: new Date().toISOString(), level, code, message };
  allAlerts.push(alert);
  
  if (alertsFeed) {
    const el = document.createElement("div");
    el.className = `alert-item ${level === 'warn' ? 'alert-warn' : level === 'critical' ? 'alert-crit' : ''}`;
    el.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
    alertsFeed.prepend(el);
  }
}

function updateOverlay(bpm: number, blinkRate: number, lipSyncDrift: number, score: number, threatLevel: string) {
  if (statusEl) {
    statusEl.innerText = threatLevel.toUpperCase();
    statusEl.style.color = threatLevel === "deepfake" ? "#ef4444" : threatLevel === "suspicious" ? "#f59e0b" : "#4ade80";
  }
  if (bpmEl) bpmEl.innerText = bpm > 0 ? Math.round(bpm).toString() : "--";
  if (blinkEl) blinkEl.innerText = blinkRate > 0 ? blinkRate.toFixed(1) : "--";
  if (lipSyncEl) lipSyncEl.innerText = lipSyncDrift > 0 ? `${Math.round(lipSyncDrift * 100)}%` : "--";
  if (barEl) {
    barEl.style.width = `${score}%`;
    barEl.style.background = threatLevel === "deepfake" ? "#ef4444" : threatLevel === "suspicious" ? "#f59e0b" : "#4ade80";
  }
  
  let v = 0;
  if (threatLevel === "suspicious") v = 1;
  else if (threatLevel === "deepfake") v = 2;
  if (v > maxThreatScore) maxThreatScore = v;
}

function showError(msg: string) {
  if (errContainer) errContainer.innerText = msg;
  if (statusEl) {
    statusEl.innerText = "ERROR";
    statusEl.style.color = "#ef4444";
  }
}

// UI Bindings
btnSettings?.addEventListener("click", () => {
  if (settingsPanel) settingsPanel.style.display = "flex";
  if (inpBlinkLow) inpBlinkLow.value = config.blinkLowThresh.toString();
  if (inpBlinkHigh) inpBlinkHigh.value = config.blinkHighThresh.toString();
  if (inpLipSync) inpLipSync.value = config.lipSyncDriftMax.toString();
  if (inpRppg) inpRppg.value = config.rppgConfidenceMin.toString();
});

btnSettingsCancel?.addEventListener("click", () => {
  if (settingsPanel) settingsPanel.style.display = "none";
});

btnSettingsSave?.addEventListener("click", () => {
  config = {
    blinkLowThresh: Number(inpBlinkLow?.value || 4),
    blinkHighThresh: Number(inpBlinkHigh?.value || 45),
    lipSyncDriftMax: Number(inpLipSync?.value || 0.55),
    rppgConfidenceMin: Number(inpRppg?.value || 0.15),
  };
  localStorage.setItem("mb-ext-config", JSON.stringify(config));
  if (settingsPanel) settingsPanel.style.display = "none";
});

btnExport?.addEventListener("click", () => {
  const report = {
    timestamp: new Date().toISOString(),
    durationSeconds: Math.floor((Date.now() - sessionStartTime) / 1000),
    maxThreatLevel: maxThreatScore === 2 ? "DEEPFAKE" : maxThreatScore === 1 ? "SUSPICIOUS" : "TRUSTED",
    alerts: allAlerts
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mb-ext-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

async function initAudio() {
  if (audioCtx) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioDataArray = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    console.log("[MirrorBreaker] Room Listener Microphone active.");
  } catch (err) {
    console.warn("[MirrorBreaker] Microphone access denied for Room Listener.", err);
  }
}

// Auto-start Room Listener immediately
initAudio();

// Also resume on click in case Chrome suspends it
window.addEventListener("click", () => {
  if (audioCtx?.state === "suspended") audioCtx.resume();
  else if (!audioCtx) initAudio();
}, { once: false });

async function initModel() {
  updateOverlay(0, 0, 0, 50, "LOADING AI");
  try {
    const wasmUrl = chrome.runtime.getURL("assets");
    const modelUrl = chrome.runtime.getURL("assets/face_landmarker.task");

    const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    updateOverlay(0, 0, 0, 50, "READY");
    window.parent.postMessage({ type: "IFRAME_READY" }, "*");
    console.log("[MirrorBreaker] Model loaded inside iframe.");
  } catch (err: any) {
    showError(err.message || String(err));
  }
}

window.addEventListener("message", async (event) => {
  if (isProcessing || !landmarker) return;
  if (event.data && event.data.type === "FRAME") {
    isProcessing = true;
    try {
      const { imageData, width, height, timestamp } = event.data;
      // Use synchronous ImageData constructor as it's fast
      const img = new ImageData(new Uint8ClampedArray(imageData), width, height);
      analyzeFrame(img, width, height, timestamp);
    } catch (err) {
      console.error("[MirrorBreaker] Frame processing error:", err);
    } finally {
      isProcessing = false;
    }
  }
});

function analyzeFrame(imageData: ImageData, w: number, h: number, now: number) {
  let result: FaceLandmarkerResult | null = null;
  try { result = landmarker!.detect(imageData); } catch { return; }

  const faces = result?.faceLandmarks ?? [];
  const faceDetected = faces.length > 0;
  
  // Calculate Audio RMS from local mic
  let currentRms = 0;
  if (analyser && audioDataArray) {
    analyser.getByteTimeDomainData(audioDataArray);
    let sumSquares = 0;
    for (let i = 0; i < audioDataArray.length; i++) {
      const norm = (audioDataArray[i] / 128.0) - 1.0;
      sumSquares += norm * norm;
    }
    currentRms = Math.sqrt(sumSquares / audioDataArray.length);
  }
  audioSeries.push(currentRms, now);

  if (faceDetected) {
    const landmarks = faces[0] as Pt[];
    
    // rPPG Extract
    const foreheadBox = landmarksBBox(landmarks, FOREHEAD_LANDMARKS, w, h);
    if (foreheadBox && foreheadBox.w > 4 && foreheadBox.h > 4) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const data = imageData.data;
      const startX = Math.max(0, Math.floor(foreheadBox.x));
      const startY = Math.max(0, Math.floor(foreheadBox.y));
      const endX = Math.min(w, startX + Math.floor(foreheadBox.w));
      const endY = Math.min(h, startY + Math.floor(foreheadBox.h));

      for (let y = startY; y < endY; y += 2) { // Subsample by 2 for speed
        const rowOffset = (y * w) * 4;
        for (let x = startX; x < endX; x += 2) {
          const idx = rowOffset + (x * 4);
          rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++;
        }
      }
      if (count > 0) {
        const rMean = rSum / count, gMean = gSum / count, bMean = bSum / count;
        // Faster chrominance approximation
        const chrom = (3 * rMean - 2 * gMean - (1.5 * gMean + 1.5 * bMean) * 0.5);
        const sample = gMean - 0.5 * (rMean + bMean) + chrom * 0.05;
        greenSeries.push(sample, now);
      }
    }

    // Blink Extract
    const earCurrent = (eyeAspectRatio(landmarks, LEFT_EYE_EAR) + eyeAspectRatio(landmarks, RIGHT_EYE_EAR)) / 2;
    earSeries.push(earCurrent, now);
    
    // Dynamic Blink Baseline
    if (earCurrent > recentEarMax) {
      recentEarMax = earCurrent;
    } else {
      recentEarMax = recentEarMax * 0.999 + earCurrent * 0.001;
    }

    const BLINK_THRESH = recentEarMax * 0.75;
    if (!blinkState && earCurrent < BLINK_THRESH) {
      blinkState = true;
      blinkTimes.push(now);
      while (blinkTimes.length && blinkTimes[0] < now - BLINK_WINDOW_MS) blinkTimes.shift();
    } else if (blinkState && earCurrent > BLINK_THRESH + 0.02) {
      blinkState = false;
    }
    
    // Lip Sync Extract
    mouthSeries.push(mouthOpenness(landmarks), now);

    // Head pose tracking (Nose Tip variance)
    noseSeriesX.push(landmarks[NOSE_TIP].x, now);
    noseSeriesY.push(landmarks[NOSE_TIP].y, now);
  }

  // Derive metrics
  let bpm = 0;
  let rppgConfidence = 0;
  const gVals = greenSeries.getValues();
  if (gVals.length > 90 && greenSeries.sampleRate() > 5) {
    const { freqHz, snr } = estimateDominantFrequency(gVals, greenSeries.sampleRate(), 0.7, 3.5, 80);
    bpm = freqHz * 60;
    rppgConfidence = clamp((snr - 1) / 8, 0, 1);
  }

  const blinkWinSec = Math.min(BLINK_WINDOW_MS, now - (blinkTimes[0] ?? now)) / 1000;
  const blinkRatePerMin = blinkTimes.length > 0 && blinkWinSec > 2 ? (blinkTimes.length / blinkWinSec) * 60 : 0;

  // Lip Sync Drift
  let lipSyncDrift = 0;
  const audVals = audioSeries.getValues();
  const mouthVals = mouthSeries.getValues();
  const audMean = audVals.reduce((s, v) => s + v, 0) / Math.max(1, audVals.length);
  if (audMean > 0.015 && audVals.length > 30 && mouthVals.length > 30) {
    const N = Math.min(audVals.length, mouthVals.length, 120);
    const a = audVals.slice(-N);
    const m = mouthVals.slice(-N);
    
    const mouthVar = std(m);
    const maxMouth = Math.max(...m);
    
    // Ventriloquist Check: Loud audio but mouth is completely shut
    if (mouthVar < 0.005 && maxMouth < 0.06) {
      lipSyncDrift = 0.95;
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

  // Composite Score
  let score = 100;
  if (!faceDetected) {
    score = trustEMA.get() || 50;
  } else {
    if (gVals.length > 150) {
      if (rppgConfidence < config.rppgConfidenceMin) {
        score -= 35;
        pushAlert("warn", "RPPG_FLAT", "Low rPPG confidence");
      }
      if (bpm < 45 || bpm > 180) score -= 10;
    }
    if (earSeries.getValues().length > 200) {
      if (blinkRatePerMin < config.blinkLowThresh) {
        score -= 25;
        pushAlert("warn", "BLINK_LOW", "Erratic blink pattern");
      }
    }
    if (lipSyncDrift > config.lipSyncDriftMax) {
      score -= 25;
      pushAlert("critical", "LIP_DRIFT", "Lip-Sync mismatch");
    }

    // Head Pose Rigidity
    const nx = noseSeriesX.getValues();
    const ny = noseSeriesY.getValues();
    if (nx.length > 90) {
      const varX = std(nx);
      const varY = std(ny);
      if (varX < 0.0005 && varY < 0.0005) {
         score -= 25;
         pushAlert("critical", "HEAD_STATIC", "Unnatural head rigidity detected");
      }
    }
  }
  
  score = clamp(score, 0, 100);
  const smoothed = trustEMA.update(score);
  const threatLevel = smoothed >= 70 ? "trusted" : smoothed >= 40 ? "suspicious" : "deepfake";
  
  if (smoothed < 40) pushAlert("critical", "DEEPFAKE", "DEEPFAKE PROBABILITY HIGH.");

  updateOverlay(bpm, blinkRatePerMin, lipSyncDrift, smoothed, threatLevel);
  
  window.parent.postMessage({ type: "THREAT_LEVEL", level: threatLevel }, "*");
}

initModel();
