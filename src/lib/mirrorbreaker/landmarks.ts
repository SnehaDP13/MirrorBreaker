// MediaPipe FaceMesh landmark indices we care about.
// 478-point face mesh (with iris). See https://github.com/google/mediapipe.

export const LEFT_EYE_EAR = {
  // For Eye Aspect Ratio: P1..P6
  p1: 33, // outer corner
  p2: 160, // upper outer
  p3: 158, // upper inner
  p4: 133, // inner corner
  p5: 153, // lower inner
  p6: 144, // lower outer
};

export const RIGHT_EYE_EAR = {
  p1: 263,
  p2: 387,
  p3: 385,
  p4: 362,
  p5: 380,
  p6: 373,
};

// A patch of the forehead between the eyebrows, above the nose bridge.
// Stable region with thin skin = strong rPPG signal.
export const FOREHEAD_LANDMARKS = [10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132];
export const NOSE_TIP = 1;

// Mouth outer ring for lip-sync analysis.
export const MOUTH_OUTER = [61, 291, 78, 308, 13, 14, 17, 0];
// Upper / lower lip vertical pairs to estimate mouth opening.
export const MOUTH_OPEN_PAIRS: Array<[number, number]> = [
  [13, 14], // inner top/bottom
  [12, 15], // mid
  [11, 16],
];

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

export function dist2D(a: Pt, b: Pt) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Eye Aspect Ratio (Soukupová & Čech 2016). */
export function eyeAspectRatio(landmarks: Pt[], idx: typeof LEFT_EYE_EAR): number {
  const p1 = landmarks[idx.p1];
  const p2 = landmarks[idx.p2];
  const p3 = landmarks[idx.p3];
  const p4 = landmarks[idx.p4];
  const p5 = landmarks[idx.p5];
  const p6 = landmarks[idx.p6];
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const v = dist2D(p2, p6) + dist2D(p3, p5);
  const h = 2 * dist2D(p1, p4);
  return h > 0 ? v / h : 0;
}

/** Compute axis-aligned bbox of given landmark indices in pixel coords. */
export function landmarksBBox(
  landmarks: Pt[],
  indices: number[],
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of indices) {
    const p = landmarks[i];
    if (!p) return null;
    const px = p.x * width;
    const py = p.y * height;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return {
    x: Math.max(0, Math.floor(minX)),
    y: Math.max(0, Math.floor(minY)),
    w: Math.max(1, Math.ceil(maxX - minX)),
    h: Math.max(1, Math.ceil(maxY - minY)),
  };
}

/** Mouth opening normalized by mouth width. Range ~ 0..0.6. */
export function mouthOpenness(landmarks: Pt[]): number {
  const left = landmarks[61];
  const right = landmarks[291];
  if (!left || !right) return 0;
  const width = dist2D(left, right);
  if (width <= 0) return 0;
  let acc = 0;
  let n = 0;
  for (const [a, b] of MOUTH_OPEN_PAIRS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    acc += dist2D(pa, pb);
    n++;
  }
  if (!n) return 0;
  return acc / n / width;
}