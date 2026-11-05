/**
 * Tiny perspective camera for the ring stage. The ring lies on the floor
 * (x/z plane), the camera sits just above it looking slightly down, so the
 * front of the ring (z > 0) is big and low on screen and the back is small.
 */
export const VIEW = { x: 90, y: 20, w: 820, h: 560 };
export const CX = 500;
const HORIZON = 112;
const FOCAL = 900;
const DIST = 1250;
const CAM_H = 330;

export const RING_R = 420;
export const TUBE_W = 40; // half-width of the tube
export const TUBE_H = 44; // height of the tube's top surface

export interface P {
  x: number;
  y: number;
  /** Perspective scale at this point (≈1 at the front). */
  s: number;
  /** Depth: positive = toward the viewer. */
  z: number;
}

export function project(x: number, z: number, y = 0): P {
  const s = FOCAL / (DIST - z);
  return { x: CX + x * s, y: HORIZON + (CAM_H - y) * s, s, z };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Point on a ring of radius r at screen angle psi (0 = front, toward viewer). */
export function ringPoint(r: number, psiDeg: number, y = 0): P {
  const a = rad(psiDeg);
  return project(r * Math.sin(a), r * Math.cos(a), y);
}

export const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Wrap an angle to (-180, 180]. */
export function wrap180(a: number): number {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/** Deterministic pseudo-random in [0,1) from integers. */
export function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v) + 0x9e3779b9;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
