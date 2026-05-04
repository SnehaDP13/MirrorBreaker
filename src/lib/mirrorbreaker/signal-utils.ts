// Signal processing utilities for rPPG and physiological analysis.
// All pure functions — easy to unit test, no DOM deps.

/** Ring buffer that retains the last N milliseconds of samples. */
export class TimeSeries {
  private values: number[] = [];
  private times: number[] = [];
  constructor(private maxAgeMs: number) {}

  push(value: number, t: number) {
    this.values.push(value);
    this.times.push(t);
    const cutoff = t - this.maxAgeMs;
    while (this.times.length && this.times[0] < cutoff) {
      this.times.shift();
      this.values.shift();
    }
  }

  get length() {
    return this.values.length;
  }

  getValues() {
    return this.values;
  }

  getTimes() {
    return this.times;
  }

  /** Estimate sample rate (Hz) over current window. */
  sampleRate(): number {
    if (this.times.length < 2) return 0;
    const dur = (this.times[this.times.length - 1] - this.times[0]) / 1000;
    if (dur <= 0) return 0;
    return (this.times.length - 1) / dur;
  }

  clear() {
    this.values = [];
    this.times = [];
  }
}

/** Subtract mean (DC removal). */
export function detrend(x: number[]): number[] {
  if (!x.length) return x;
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  return x.map((v) => v - mean);
}

/**
 * Simple IIR bandpass filter for rPPG signal.
 * Passes frequencies between fLow and fHigh Hz.
 * Uses cascaded 2nd-order Butterworth sections.
 */
export function bandpassFilter(
  signal: number[],
  sampleRate: number,
  fLow: number,
  fHigh: number,
): number[] {
  if (signal.length < 6 || sampleRate <= 0) return signal;

  // Normalize frequencies to [0, 1] where 1 = Nyquist
  const nyquist = sampleRate / 2;
  const wLow = fLow / nyquist;
  const wHigh = fHigh / nyquist;

  // Simple 2nd-order IIR bandpass (biquad)
  const bw = wHigh - wLow;
  const center = (wLow + wHigh) / 2;
  const R = 1 - 3 * bw;
  const cosF = 2 * Math.cos(2 * Math.PI * center);
  const K = (1 - R * cosF + R * R) / (2 - cosF);

  const a0 = 1 - K;
  const a1 = 2 * (K - R) * cosF;
  const a2 = R * R - K;
  const b1 = 2 * R * cosF;
  const b2 = -(R * R);

  const out = new Array(signal.length).fill(0);
  for (let i = 2; i < signal.length; i++) {
    out[i] =
      a0 * signal[i] +
      a1 * signal[i - 1] +
      a2 * signal[i - 2] +
      b1 * out[i - 1] +
      b2 * out[i - 2];
  }
  return out;
}

/** Hann window. */
function hann(n: number): number[] {
  const w: number[] = new Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/**
 * Compute power spectrum at a single frequency using the Goertzel algorithm.
 * Faster than full FFT when scanning a small frequency band.
 */
function goertzelPower(x: number[], targetFreq: number, sampleRate: number): number {
  const N = x.length;
  const k = Math.round((N * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / N;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < N; i++) {
    s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Estimate dominant frequency in [fMin, fMax] Hz using Goertzel scan.
 * Returns { freqHz, snr } where snr is peak / mean of band.
 * Uses 120 steps for finer resolution (was 60).
 */
export function estimateDominantFrequency(
  signal: number[],
  sampleRate: number,
  fMin: number,
  fMax: number,
  steps = 120,
): { freqHz: number; power: number; snr: number } {
  if (signal.length < 32 || sampleRate <= 0) {
    return { freqHz: 0, power: 0, snr: 0 };
  }
  const detrended = detrend(signal);
  const win = hann(detrended.length);
  const windowed = detrended.map((v, i) => v * win[i]);

  let bestFreq = 0;
  let bestPower = -Infinity;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const f = fMin + ((fMax - fMin) * i) / steps;
    const p = goertzelPower(windowed, f, sampleRate);
    sum += p;
    if (p > bestPower) {
      bestPower = p;
      bestFreq = f;
    }
  }
  const mean = sum / (steps + 1);
  const snr = mean > 0 ? bestPower / mean : 0;
  return { freqHz: bestFreq, power: bestPower, snr };
}

/**
 * Cross-correlation between two signals with optional max lag.
 * Returns the lag (in samples) that maximizes correlation, and the
 * Pearson correlation coefficient at that lag.
 * Positive lag means signal `b` leads `a`.
 */
export function crossCorrelation(
  a: number[],
  b: number[],
  maxLag: number,
): { bestLag: number; bestCorr: number } {
  const N = Math.min(a.length, b.length);
  if (N < 4) return { bestLag: 0, bestCorr: 0 };

  // Detrend both
  const aMean = a.slice(0, N).reduce((s, v) => s + v, 0) / N;
  const bMean = b.slice(0, N).reduce((s, v) => s + v, 0) / N;

  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sumAB = 0, sumA2 = 0, sumB2 = 0;
    let count = 0;

    for (let i = 0; i < N; i++) {
      const j = i + lag;
      if (j < 0 || j >= N) continue;
      const av = a[i] - aMean;
      const bv = b[j] - bMean;
      sumAB += av * bv;
      sumA2 += av * av;
      sumB2 += bv * bv;
      count++;
    }

    if (count < 4) continue;
    const denom = Math.sqrt(sumA2 * sumB2);
    const corr = denom > 0 ? sumAB / denom : 0;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return { bestLag, bestCorr };
}

/** Standard deviation. */
export function std(x: number[]): number {
  if (x.length < 2) return 0;
  const m = x.reduce((s, v) => s + v, 0) / x.length;
  const v = x.reduce((s, v2) => s + (v2 - m) * (v2 - m), 0) / x.length;
  return Math.sqrt(v);
}

/** Min-max normalize to [0,1]. */
export function normalize(x: number[]): number[] {
  if (!x.length) return x;
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of x) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const range = mx - mn || 1;
  return x.map((v) => (v - mn) / range);
}

/** Clamp helper. */
export function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

/** Exponential moving average. */
export class EMA {
  private value: number | null = null;
  constructor(private alpha: number) {}
  update(x: number) {
    this.value = this.value == null ? x : this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
  get(): number {
    return this.value ?? 0;
  }
  reset() {
    this.value = null;
  }
}