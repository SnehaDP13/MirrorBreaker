// Signal processing utilities for rPPG and physiological analysis.
// All pure functions — easy to unit test, no DOM deps.

/** Ring buffer that retains the last N samples (timestamp + value). */
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

/** Subtract mean. */
export function detrend(x: number[]): number[] {
  if (!x.length) return x;
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  return x.map((v) => v - mean);
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
 */
export function estimateDominantFrequency(
  signal: number[],
  sampleRate: number,
  fMin: number,
  fMax: number,
  steps = 60,
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