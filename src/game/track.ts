/**
 * Tracks: a closed loop of control points, smoothed with a Catmull-Rom spline and resampled every `step` metres.
 * The sim asks `project()` where a kart is relative to the centre line (distance along the lap, sideways offset).
 * Pure maths, no three.js: the server replays races with the same geometry.
 */

export interface TrackDef {
  id: string;
  name: string;
  /** [x, z, height, roadHalfWidth] per control point, in driving order. The finish line is at the first point. */
  points: [number, number, number, number][];
  /** Grass between road edge and wall, m. */
  shoulder: number;
  /** Rows of item boxes: distance along the lap and how many across. */
  itemRows: { s: number; count: number }[];
  /** Boost pads: distance along the lap, sideways offset, length. */
  boostPads: { s: number; lateral: number; length: number }[];
  /** Resample spacing, m. */
  step: number;
  theme: { sky: number; fog: number; ground: number; water: number; road: number };
}

export interface TrackSample {
  x: number;
  z: number;
  y: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
  /** Road half-width here. */
  half: number;
  /** Distance from the finish line. */
  s: number;
}

export interface Track {
  def: TrackDef;
  samples: TrackSample[];
  length: number;
}

export interface Projection {
  /** Index of the sample at the start of the nearest segment. */
  i: number;
  /** Distance along the lap, 0..length. */
  s: number;
  /** Signed sideways offset: positive = left of travel. */
  lateral: number;
  half: number;
  y: number;
  tx: number;
  tz: number;
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const SUBDIV = 40;

export function buildTrack(def: TrackDef): Track {
  const n = def.points.length;
  // Dense polyline from the spline.
  const dense: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = def.points[(i - 1 + n) % n]!;
    const p1 = def.points[i]!;
    const p2 = def.points[(i + 1) % n]!;
    const p3 = def.points[(i + 2) % n]!;
    for (let k = 0; k < SUBDIV; k++) {
      const t = k / SUBDIV;
      dense.push([0, 1, 2, 3].map((c) => catmull(p0[c]!, p1[c]!, p2[c]!, p3[c]!, t)) as [number, number, number, number]);
    }
  }
  // Cumulative length of the dense polyline.
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i % dense.length]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[dense.length]!;
  const count = Math.max(8, Math.round(total / def.step));
  const step = total / count;
  const samples: TrackSample[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (cum[j + 1]! < target) j++;
    const a = dense[j]!;
    const b = dense[(j + 1) % dense.length]!;
    const f = (target - cum[j]!) / (cum[j + 1]! - cum[j]! || 1);
    samples.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, half: a[3] + (b[3] - a[3]) * f, tx: 0, tz: 0, s: target });
  }
  for (let k = 0; k < count; k++) {
    const prev = samples[(k - 1 + count) % count]!;
    const next = samples[(k + 1) % count]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    samples[k]!.tx = dx / l;
    samples[k]!.tz = dz / l;
  }
  return { def, samples, length: total };
}

/** Wrap a distance into 0..length. */
export const wrapS = (track: Track, s: number): number => ((s % track.length) + track.length) % track.length;

/** The sample at (or just before) distance `s`, with linear interpolation of position. */
export function pointAt(track: Track, s: number, lateral = 0): { x: number; z: number; y: number; tx: number; tz: number; half: number; i: number } {
  const n = track.samples.length;
  const w = wrapS(track, s);
  const step = track.length / n;
  const i = Math.min(n - 1, Math.floor(w / step));
  const a = track.samples[i]!;
  const b = track.samples[(i + 1) % n]!;
  const f = (w - a.s) / step;
  const tx = a.tx + (b.tx - a.tx) * f;
  const tz = a.tz + (b.tz - a.tz) * f;
  const l = Math.hypot(tx, tz) || 1;
  const ux = tx / l;
  const uz = tz / l;
  // Left of travel, with x right and z forward in a right-handed y-up world: (tz, -tx).
  return { x: a.x + (b.x - a.x) * f + uz * lateral, z: a.z + (b.z - a.z) * f - ux * lateral, y: a.y + (b.y - a.y) * f, tx: ux, tz: uz, half: a.half + (b.half - a.half) * f, i };
}

/**
 * Where (x, z) is relative to the centre line. `hint` is the last known sample index: the search stays within
 * `window` samples of it, so a kart can't jump to a nearby stretch of a different part of the lap. -1 = search all.
 */
export function project(track: Track, x: number, z: number, hint: number, window = 24): Projection {
  const n = track.samples.length;
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  const from = hint < 0 ? 0 : hint - window;
  const to = hint < 0 ? n - 1 : hint + window;
  for (let k = from; k <= to; k++) {
    const i = ((k % n) + n) % n;
    const a = track.samples[i]!;
    const b = track.samples[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez || 1;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + ex * t;
    const pz = a.z + ez * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) {
      best = d;
      bi = i;
      bt = t;
    }
  }
  const a = track.samples[bi]!;
  const b = track.samples[(bi + 1) % n]!;
  const segLen = Math.hypot(b.x - a.x, b.z - a.z);
  const px = a.x + (b.x - a.x) * bt;
  const pz = a.z + (b.z - a.z) * bt;
  const ux = (b.x - a.x) / (segLen || 1);
  const uz = (b.z - a.z) / (segLen || 1);
  const lateral = (x - px) * uz - (z - pz) * ux;
  const s = bi === n - 1 ? a.s + bt * (track.length - a.s) : a.s + bt * segLen;
  return { i: bi, s, lateral, half: a.half + (b.half - a.half) * bt, y: a.y + (b.y - a.y) * bt, tx: ux, tz: uz };
}

/** Total heading change (rad, signed: + = turning left) over the next `ahead` metres from `s`. */
export function curvatureAhead(track: Track, s: number, ahead: number): number {
  const a = pointAt(track, s);
  const b = pointAt(track, s + ahead * 0.5);
  const c = pointAt(track, s + ahead);
  const ang = (u: { tx: number; tz: number }, v: { tx: number; tz: number }): number => Math.atan2(u.tx * v.tz - u.tz * v.tx, u.tx * v.tx + u.tz * v.tz);
  // Positive cross(t1, t2) in x/z means turning toward -left... normalise so + = left (toward the lateral+ side).
  return -(ang(a, b) + ang(b, c));
}

/** Coral Coast: an original seaside circuit with a long start straight, a climbing S, a hairpin and a fast sweeper. */
export const CORAL_COAST: TrackDef = {
  id: 'coral-coast',
  name: 'Coral Coast',
  points: [
    [0, 0, 0, 9],
    [70, 0, 0, 9],
    [135, 8, 0, 9],
    [175, 45, 0.5, 8.5],
    [180, 100, 1.5, 8.5],
    [150, 145, 3, 8.5],
    [100, 150, 4.5, 8],
    [70, 120, 5.5, 8],
    [35, 95, 6, 8],
    [0, 110, 6, 8],
    [-20, 150, 5, 8],
    [-25, 200, 3.5, 8.5],
    [-60, 235, 2, 9],
    [-110, 230, 1, 9],
    [-130, 190, 0.5, 8.5],
    [-115, 145, 0, 8],
    [-145, 100, 0, 8.5],
    [-165, 55, 0, 9],
    [-135, 10, 0, 9],
    [-70, 0, 0, 9],
  ],
  shoulder: 6,
  itemRows: [
    { s: 150, count: 4 },
    { s: 470, count: 4 },
    { s: 760, count: 4 },
  ],
  boostPads: [
    { s: 330, lateral: 0, length: 6 },
    { s: 640, lateral: 3.5, length: 6 },
    { s: 905, lateral: -3, length: 6 },
  ],
  step: 1,
  theme: { sky: 0x7cc8ff, fog: 0xbfe6ff, ground: 0x5cc04a, water: 0x1fa3d8, road: 0x4a4f5c },
};
