// MediaPipe FaceMesh landmark indices we care about.
// 478-point face mesh (with iris). See https://github.com/google/mediapipe.

export const LEFT_EYE_EAR = {
  // For Eye Aspect Ratio: P1..P6 (Soukupová & Čech 2016)
  p1: 33, // outer corner (lateral canthus)
  p2: 160, // upper outer lid
  p3: 158, // upper inner lid
  p4: 133, // inner corner (medial canthus)
  p5: 153, // lower inner lid
  p6: 144, // lower outer lid
};

export const RIGHT_EYE_EAR = {
  p1: 263, // outer corner
  p2: 387, // upper outer lid
  p3: 385, // upper inner lid
  p4: 362, // inner corner
  p5: 380, // lower inner lid
  p6: 373, // lower outer lid
};

// Forehead ROI for rPPG signal extraction.
// CRITICAL: These MUST be actual forehead landmarks (between hairline and eyebrows).
// Previous version included jaw/cheek points (127, 234, 93, 132) which corrupted
// the rPPG signal with non-pulsatile skin regions.
// These landmarks define the glabella + mid-forehead region — thin skin, minimal
// movement artifact, strong pulsatile blood flow signal.
export const FOREHEAD_LANDMARKS = [
  10,  // top of forehead center
  151, // mid forehead center
  9,   // between eyebrows center
  8,   // between eyebrows center (slightly lower)
  107, // right inner forehead
  336, // left inner forehead
  66,  // right mid forehead
  296, // left mid forehead
  67,  // right forehead
  297, // left forehead
  103, // right upper forehead
  332, // left upper forehead
  69,  // right forehead edge
  299, // left forehead edge
];

export const NOSE_TIP = 1;

// Mouth outer ring for lip-sync analysis.
export const MOUTH_OUTER = [61, 291, 78, 308, 13, 14, 17, 0];

// Upper / lower lip vertical pairs to estimate mouth opening.
// Using multiple pairs across the lip width for robust measurement.
export const MOUTH_OPEN_PAIRS: Array<[number, number]> = [
  [13, 14],   // inner center top/bottom (most reliable)
  [12, 15],   // mid
  [11, 16],   // outer-mid
  [82, 87],   // right side inner
  [312, 317], // left side inner
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
  // Pad the box slightly to capture full forehead region
  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;
  return {
    x: Math.max(0, Math.floor(minX - padX)),
    y: Math.max(0, Math.floor(minY - padY)),
    w: Math.max(1, Math.ceil(maxX - minX + 2 * padX)),
    h: Math.max(1, Math.ceil(maxY - minY + 2 * padY)),
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