/**
 * The race: a fixed-step, deterministic simulation of every kart, item and box. The browser runs it for play and
 * the server replays it from the seed and the player's inputs to check the score. No clock, no Math.random, no I/O.
 *
 * Angles: a direction angle `a` points along (cos a, sin a) in the x/z plane. Increasing `a` turns right, so
 * steer +1 = right. "Left" of travel is the track's positive lateral side.
 */
import { DEFAULT_RULES, ITEM_KINDS, TEAMS, type ItemKind, type Rules } from './config';
import { nextRandom } from './rng';
import { buildTrack, CORAL_COAST, curvatureAhead, pointAt, project, wrapS, type Track } from './track';

export interface Input {
  /** -1 (full left) .. 1 (full right); quantised to sixteenths. */
  steer: number;
  /** Drift / hop (and rocket start during the countdown). Held. */
  drift: boolean;
  /** Use the back rider's item. Edge-triggered. */
  item: boolean;
  /** Swap riders (and their items). Edge-triggered. */
  swap: boolean;
  /** E-brake: slows the kart and pivots it through tight turns. Held. */
  brake: boolean;
}

export const NO_INPUT: Input = { steer: 0, drift: false, item: false, swap: false, brake: false };

export interface Kart {
  id: number;
  team: number;
  ai: boolean;
  skill: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  moveAngle: number;
  speed: number;
  seg: number;
  s: number;
  raceS: number;
  lateral: number;
  /** -1 left, 0 none, 1 right. */
  drift: number;
  charge: number;
  tier: number;
  hop: number;
  boost: number;
  spin: number;
  spinTotal: number;
  invuln: number;
  stall: number;
  /** [front rider's item, back rider's item]. The back rider throws. */
  items: [ItemKind | null, ItemKind | null];
  roulette: number;
  /** True when the team's second rider is driving. */
  swapped: boolean;
  swapCd: number;
  draft: number;
  drafting: boolean;
  offroad: boolean;
  wrongWay: number;
  prevDrift: boolean;
  prevItem: boolean;
  prevSwap: boolean;
  startPress: number;
  finished: boolean;
  finishTick: number;
  place: number;
  lanePhase: number;
  aiDrift: number;
  aiHold: number;
  steerShown: number;
  lapSeen: number;
  finishSeen: boolean;
}

export interface Projectile {
  id: number;
  kind: 'bouncer' | 'seeker' | 'slick';
  x: number;
  z: number;
  angle: number;
  owner: number;
  target: number;
  age: number;
  seg: number;
}

export interface Box {
  s: number;
  lateral: number;
  x: number;
  z: number;
  y: number;
  respawn: number;
}

export type RaceEvent =
  | { type: 'boost'; kart: number; why: 'turbo' | 'nitro' | 'pad' | 'draft' | 'rocket'; tier?: number }
  | { type: 'hit'; kart: number; by: number; kind: Projectile['kind'] }
  | { type: 'pickup'; kart: number }
  | { type: 'use'; kart: number; kind: ItemKind }
  | { type: 'wall'; kart: number; force: number }
  | { type: 'bump'; a: number; b: number; force: number }
  | { type: 'lap'; kart: number; lap: number }
  | { type: 'finish'; kart: number; place: number }
  | { type: 'swap'; kart: number }
  | { type: 'stall'; kart: number }
  | { type: 'spark'; kart: number; tier: number }
  | { type: 'go' };

export interface Race {
  rules: Rules;
  track: Track;
  tick: number;
  goTick: number;
  rng: number;
  karts: Kart[];
  projectiles: Projectile[];
  boxes: Box[];
  nextId: number;
  player: number;
  events: RaceEvent[];
  /** Set once the player crosses the line or time runs out. */
  over: boolean;
}

const TRACKS = new Map<string, Track>();
export const getTrack = (id = CORAL_COAST.id): Track => {
  let t = TRACKS.get(id);
  if (!t) {
    t = buildTrack(CORAL_COAST);
    TRACKS.set(id, t);
  }
  return t;
};

const wrapAngle = (a: number): number => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Steering resolution: 1/16 of full lock, fine enough for gentle corrections. */
export const STEER_STEPS = 16;
export const quantiseSteer = (s: number): number => Math.round(clamp(s, -1, 1) * STEER_STEPS) / STEER_STEPS;

/** A new race. `playerTeam` picks the player's crew; the other karts cycle through the crews. */
export function createRace(seed: number, playerTeam = 0, rules: Rules = DEFAULT_RULES): Race {
  const track = getTrack();
  const race: Race = { rules, track, tick: 0, goTick: Math.round(rules.countdownSec * rules.tickHz), rng: seed | 0, karts: [], projectiles: [], boxes: [], nextId: 1, player: rules.playerGridSlot, events: [], over: false };
  for (let slot = 0; slot < rules.karts; slot++) {
    const row = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? 1 : -1;
    const s = -(rules.grid.firstRowBack + row * rules.grid.rowGap + (slot % 2) * rules.grid.rowGap * 0.5);
    const p = pointAt(track, s, side * rules.grid.laneOffset);
    const heading = Math.atan2(p.tz, p.tx);
    const isPlayer = slot === rules.playerGridSlot;
    const team = isPlayer ? playerTeam : (playerTeam + 1 + (slot % (TEAMS.length - 1))) % TEAMS.length;
    const [lo, hi] = rules.ai.skill;
    race.karts.push({
      id: slot, team, ai: !isPlayer, skill: isPlayer ? 1 : lo + (hi - lo) * nextRandom(race),
      x: p.x, z: p.z, y: p.y, heading, moveAngle: heading, speed: 0, seg: p.i, s: wrapS(track, s), raceS: s, lateral: side * rules.grid.laneOffset,
      drift: 0, charge: 0, tier: 0, hop: 0, boost: 0, spin: 0, spinTotal: 0, invuln: 0, stall: 0,
      items: [null, null], roulette: 0, swapped: false, swapCd: 0, draft: 0, drafting: false, offroad: false, wrongWay: 0,
      prevDrift: false, prevItem: false, prevSwap: false, startPress: -1, finished: false, finishTick: 0, place: slot + 1,
      lanePhase: nextRandom(race) * Math.PI * 2, aiDrift: 0, aiHold: 0, steerShown: 0, lapSeen: 0, finishSeen: false,
    });
  }
  for (const row of track.def.itemRows) {
    const p0 = pointAt(track, row.s);
    const span = p0.half * 1.3;
    for (let k = 0; k < row.count; k++) {
      const lateral = row.count === 1 ? 0 : -span / 2 + (span * k) / (row.count - 1);
      const p = pointAt(track, row.s, lateral);
      race.boxes.push({ s: row.s, lateral, x: p.x, z: p.z, y: p.y, respawn: 0 });
    }
  }
  return race;
}

const placeBucket = (place: number, karts: number): 'lead' | 'front' | 'middle' | 'back' =>
  place === 1 ? 'lead' : place <= Math.ceil(karts * 0.375) ? 'front' : place <= Math.ceil(karts * 0.75) ? 'middle' : 'back';

function rollItem(race: Race, place: number): ItemKind {
  const odds = race.rules.items.odds[placeBucket(place, race.karts.length)];
  const total = ITEM_KINDS.reduce((sum, k) => sum + odds[k], 0);
  let r = nextRandom(race) * total;
  for (const k of ITEM_KINDS) {
    r -= odds[k];
    if (r < 0) return k;
  }
  return 'nitro';
}

function aiInput(race: Race, k: Kart): Input {
  const { ai } = race.rules;
  const t = race.track;
  const lane = Math.sin(k.lanePhase + k.raceS * 0.012) * ai.laneAmplitude;
  const curve = curvatureAhead(t, k.s + 6, 30);
  // Shorter look-ahead in corners so pure pursuit doesn't cut across the inside grass.
  const look = (ai.lookAheadBase + ai.lookAheadPerSpeed * k.speed) / (1 + Math.abs(curve) * 1.2);
  // Lean toward the inside of corners: + curvature = left turn = + lateral.
  const inside = clamp(curve * ai.insideBias, -ai.insideMax, ai.insideMax);
  const lim = t.samples[k.seg]!.half - 2.5;
  const target = pointAt(t, k.s + look, clamp(lane * (1 - Math.min(1, Math.abs(curve))) + inside, -lim, lim));
  const want = Math.atan2(target.z - k.z, target.x - k.x);
  let steer = clamp(wrapAngle(want - k.heading) * ai.steerGain, -1, 1);
  // Drift through tight corners in the direction of the turn.
  if (k.aiDrift === 0 && Math.abs(curve) > ai.driftCurve && k.speed > race.rules.physics.driftMinSpeed + 2) k.aiDrift = -sign(curve);
  const overRotated = k.drift !== 0 && wrapAngle(want - k.heading) * k.drift < -0.3;
  const atWall = Math.abs(k.lateral) > race.track.samples[k.seg]!.half + race.track.def.shoulder * 0.5;
  if (k.aiDrift !== 0 && (Math.abs(curve) < ai.driftCurve * 0.45 || k.spin > 0 || overRotated || atWall)) k.aiDrift = 0;
  if (k.aiDrift !== 0 && k.drift === 0) steer = k.aiDrift;
  // Items.
  let item = false;
  let swap = false;
  const held = k.items[1];
  if (held && k.roulette <= 0) {
    k.aiHold += 1 / race.rules.tickHz;
    const chance = nextRandom(race) < ai.itemUsePerSec / race.rules.tickHz;
    if (chance) {
      if (held === 'nitro') item = Math.abs(curvatureAhead(t, k.s, 45)) < 0.35;
      else if (held === 'seeker') item = k.place > 1 && k.aiHold > 0.6;
      else if (held === 'bouncer') item = race.karts.some((o) => o !== k && aheadInCone(k, o, 40, 0.18)) || k.aiHold > 8;
      else item = race.karts.some((o) => o !== k && aheadInCone(o, k, 14, 0.5)) || k.aiHold > 7;
    }
  } else {
    k.aiHold = 0;
    if (!held && k.items[0] && k.swapCd <= 0 && nextRandom(race) < 1 / race.rules.tickHz) swap = true;
  }
  return { steer: quantiseSteer(steer), drift: k.aiDrift !== 0, item, swap, brake: false };
}

/** Is `o` in front of `k`, within `range` metres and `cone` radians of its travel direction? */
function aheadInCone(k: Kart, o: Kart, range: number, cone: number): boolean {
  const dx = o.x - k.x;
  const dz = o.z - k.z;
  const d = Math.hypot(dx, dz);
  if (d < 2 || d > range) return false;
  return Math.abs(wrapAngle(Math.atan2(dz, dx) - k.moveAngle)) < cone;
}

function giveBoost(race: Race, k: Kart, sec: number, why: Extract<RaceEvent, { type: 'boost' }>['why'], tier?: number): void {
  k.boost = Math.max(k.boost, sec);
  race.events.push(tier === undefined ? { type: 'boost', kart: k.id, why } : { type: 'boost', kart: k.id, why, tier });
}

function hitKart(race: Race, k: Kart, by: number, kind: Projectile['kind']): boolean {
  if (k.invuln > 0 || k.spin > 0) return false;
  const p = race.rules.physics;
  const sec = kind === 'slick' ? p.slickSpinSec : p.spinSec;
  k.spin = sec;
  k.spinTotal = sec;
  k.invuln = sec + p.invulnSec;
  k.drift = 0;
  k.charge = 0;
  k.tier = 0;
  k.boost = 0;
  race.events.push({ type: 'hit', kart: k.id, by, kind });
  return true;
}

function useItem(race: Race, k: Kart): void {
  const kind = k.items[1];
  if (!kind || k.roulette > 0) return;
  k.items[1] = null;
  k.aiHold = 0;
  race.events.push({ type: 'use', kart: k.id, kind });
  const { items } = race.rules;
  if (kind === 'nitro') return giveBoost(race, k, items.nitroSec, 'nitro');
  if (race.projectiles.length >= items.maxProjectiles) race.projectiles.shift();
  const ahead = kind !== 'slick';
  const off = ahead ? 2.4 : -items.slick.dropBack;
  const target = kind === 'seeker' ? (race.karts.find((o) => o.place === k.place - 1 && !o.finished)?.id ?? -1) : -1;
  race.projectiles.push({ id: race.nextId++, kind, x: k.x + Math.cos(k.heading) * off, z: k.z + Math.sin(k.heading) * off, angle: k.heading, owner: k.id, target, age: 0, seg: k.seg });
}

function stepKart(race: Race, k: Kart, input: Input, dt: number): void {
  const R = race.rules;
  const P = R.physics;
  const stats = TEAMS[k.team]!.stats;
  const t = race.track;
  const drift = input.drift;
  const itemPress = input.item && !k.prevItem;
  const swapPress = input.swap && !k.prevSwap;
  const driftPress = drift && !k.prevDrift;
  k.prevDrift = drift;
  k.prevItem = input.item;
  k.prevSwap = input.swap;
  k.swapCd = Math.max(0, k.swapCd - dt);
  k.invuln = Math.max(0, k.invuln - dt);
  k.hop = Math.max(0, k.hop - dt);
  k.boost = Math.max(0, k.boost - dt);
  if (k.roulette > 0) k.roulette = Math.max(0, k.roulette - dt);

  // Items and swaps work even mid-spin, like a crew scrambling.
  if (swapPress && k.swapCd <= 0 && k.roulette <= 0) {
    k.items = [k.items[1], k.items[0]];
    k.swapped = !k.swapped;
    k.swapCd = P.swapCooldownSec;
    race.events.push({ type: 'swap', kart: k.id });
  }
  if (itemPress) useItem(race, k);

  let steer = quantiseSteer(input.steer);
  k.steerShown += (steer - k.steerShown) * Math.min(1, dt * 12);
  const top = stats.topSpeed * k.skill * rubberBand(race, k);
  if (k.stall > 0) {
    k.stall = Math.max(0, k.stall - dt);
    k.speed *= 0.5;
    steer = 0;
  }
  if (k.spin > 0) {
    k.spin = Math.max(0, k.spin - dt);
    k.speed *= Math.pow(P.spinSpeedKeepPerSec, dt);
    steer = 0;
    k.heading += (Math.PI * 4 * dt) / Math.max(0.3, k.spinTotal);
  }
  const controllable = k.spin <= 0 && k.stall <= 0;

  // Drift: press while steering at speed to hop into a drift; release to cash in sparks as a mini-turbo.
  if (controllable && driftPress) k.hop = P.hopSec;
  if (controllable && drift && k.drift === 0 && Math.abs(steer) >= P.driftMinSteer && k.speed >= P.driftMinSpeed && (k.hop > 0 || driftPress || k.prevDrift)) {
    k.drift = sign(steer);
    k.charge = 0;
    k.tier = 0;
  }
  if (k.drift !== 0 && (!drift || k.speed < P.driftMinSpeed * 0.6 || !controllable)) {
    if (k.tier > 0 && controllable) giveBoost(race, k, P.turboSec[k.tier - 1]!, 'turbo', k.tier);
    k.drift = 0;
    k.charge = 0;
    k.tier = 0;
  }

  // Speed.
  const offroad = Math.abs(k.lateral) > projectHalf(race, k);
  k.offroad = offroad;
  let cap = top;
  if (offroad && k.boost <= 0) cap *= P.offroadSpeedFactor;
  if (k.drift !== 0) cap *= P.driftSpeedFactor;
  if (k.drafting) cap *= R.draft.speedFactor;
  if (k.boost > 0) cap = top * P.boostSpeedFactor;
  if (race.tick < race.goTick) cap = 0;
  if (k.spin <= 0) {
    if (k.speed < cap) k.speed = Math.min(cap, k.speed + (k.boost > 0 ? P.boostAccel : stats.accel * (1 - k.speed / (cap + 1e-6)) + 1.5) * dt);
    else k.speed = Math.max(cap, k.speed - (k.speed - cap) * P.overspeedDecay * dt);
  }

  // Steering.
  const speedFrac = clamp(k.speed / P.steerFullSpeed, 0, 1);
  const hiLoss = 1 - P.highSpeedSteerLoss * clamp(k.speed / stats.topSpeed, 0, 1.4);
  let slip = 0;
  let grip = P.grip;
  if (k.drift !== 0) {
    const into = (steer * k.drift + 1) / 2;
    k.heading += k.drift * stats.handling * (P.driftTurnBase + P.driftTurnRange * into) * speedFrac * dt;
    k.charge += (P.chargeBase + P.chargeRange * into) * dt;
    const tier = k.charge >= P.sparkTiers[2] ? 3 : k.charge >= P.sparkTiers[1] ? 2 : k.charge >= P.sparkTiers[0] ? 1 : 0;
    if (tier > k.tier) {
      k.tier = tier;
      race.events.push({ type: 'spark', kart: k.id, tier });
    }
    slip = k.drift * P.driftSlip;
    grip = P.driftGrip;
  } else if (controllable) {
    const braking = input.brake && k.speed > P.brakeMinSpeed;
    k.heading += steer * stats.handling * speedFrac * hiLoss * (braking ? P.brakeTurnBoost : 1) * dt;
    if (braking) {
      k.speed = Math.max(P.brakeMinSpeed, k.speed - P.brakeDecel * dt);
      grip = P.brakeGrip;
    }
  }
  k.heading = wrapAngle(k.heading);
  const targetMove = k.spin > 0 ? k.moveAngle : k.heading - slip;
  k.moveAngle = wrapAngle(k.moveAngle + wrapAngle(targetMove - k.moveAngle) * Math.min(1, grip * dt));

  // Move, then keep inside the walls.
  k.x += Math.cos(k.moveAngle) * k.speed * dt;
  k.z += Math.sin(k.moveAngle) * k.speed * dt;
  settle(race, k);
}

/** Road half-width where the kart is. */
const projectHalf = (race: Race, k: Kart): number => race.track.samples[k.seg]!.half;

function rubberBand(race: Race, k: Kart): number {
  if (!k.ai) return 1;
  const player = race.karts[race.player]!;
  const gap = player.raceS - k.raceS;
  const { ai } = race.rules;
  if (gap > ai.catchUpGap) return 1 + ai.catchUp * clamp((gap - ai.catchUpGap) / ai.catchUpGap, 0, 1);
  if (gap < -ai.easeOffGap) return 1 - ai.easeOff * clamp((-gap - ai.easeOffGap) / ai.easeOffGap, 0, 1);
  return 1;
}

/** Re-project onto the track, collide with walls, track lap progress. */
function settle(race: Race, k: Kart): void {
  const t = race.track;
  const P = race.rules.physics;
  const pr = project(t, k.x, k.z, k.seg);
  const wall = pr.half + t.def.shoulder - P.kartRadius;
  if (Math.abs(pr.lateral) > wall) {
    const out = sign(pr.lateral);
    const excess = Math.abs(pr.lateral) - wall;
    // Outward normal = left × out; left = (tz, -tx).
    const nx = pr.tz * out;
    const nz = -pr.tx * out;
    k.x -= nx * excess;
    k.z -= nz * excess;
    let vx = Math.cos(k.moveAngle);
    let vz = Math.sin(k.moveAngle);
    const vn = vx * nx + vz * nz;
    if (vn > 0) {
      vx -= 1.5 * vn * nx;
      vz -= 1.5 * vn * nz;
      k.moveAngle = Math.atan2(vz, vx);
      k.heading = wrapAngle(k.heading + wrapAngle(k.moveAngle - k.heading) * 0.5);
      k.speed *= 1 - (1 - P.wallSpeedKeep) * vn;
      if (vn > 0.25 && k.speed > 5) race.events.push({ type: 'wall', kart: k.id, force: vn });
    }
    pr.lateral = out * wall;
  }
  let delta = pr.s - k.s;
  if (delta > t.length / 2) delta -= t.length;
  if (delta < -t.length / 2) delta += t.length;
  k.raceS += delta;
  k.s = pr.s;
  k.seg = pr.i;
  k.lateral = pr.lateral;
  k.y = pr.y;
  const along = Math.cos(k.moveAngle) * pr.tx + Math.sin(k.moveAngle) * pr.tz;
  k.wrongWay = along < -0.3 && k.speed > 4 && k.spin <= 0 ? k.wrongWay + 1 / race.rules.tickHz : 0;
}

function collideKarts(race: Race): void {
  const P = race.rules.physics;
  const ks = race.karts;
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i]!;
      const b = ks[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = P.kartRadius * 2;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const nz = dz / d;
      const wa = TEAMS[a.team]!.stats.weight;
      const wb = TEAMS[b.team]!.stats.weight;
      const overlap = min - d;
      a.x -= nx * overlap * (wb / (wa + wb));
      a.z -= nz * overlap * (wb / (wa + wb));
      b.x += nx * overlap * (wa / (wa + wb));
      b.z += nz * overlap * (wa / (wa + wb));
      const avx = Math.cos(a.moveAngle) * a.speed;
      const avz = Math.sin(a.moveAngle) * a.speed;
      const bvx = Math.cos(b.moveAngle) * b.speed;
      const bvz = Math.sin(b.moveAngle) * b.speed;
      const closing = (avx - bvx) * nx + (avz - bvz) * nz;
      if (closing > 0) {
        const imp = (closing * P.bumpTransfer * 2) / (1 / wa + 1 / wb);
        const na = [avx - (imp / wa) * nx, avz - (imp / wa) * nz] as const;
        const nb = [bvx + (imp / wb) * nx, bvz + (imp / wb) * nz] as const;
        a.speed = Math.hypot(na[0], na[1]);
        b.speed = Math.hypot(nb[0], nb[1]);
        if (a.speed > 0.5) a.moveAngle = Math.atan2(na[1], na[0]);
        if (b.speed > 0.5) b.moveAngle = Math.atan2(nb[1], nb[0]);
        if (closing > 2) race.events.push({ type: 'bump', a: a.id, b: b.id, force: closing });
      }
      settle(race, a);
      settle(race, b);
    }
  }
}

function stepProjectiles(race: Race, dt: number): void {
  const I = race.rules.items;
  const t = race.track;
  const keep: Projectile[] = [];
  for (const p of race.projectiles) {
    p.age += dt;
    const life = p.kind === 'bouncer' ? I.bouncer.lifeSec : p.kind === 'seeker' ? I.seeker.lifeSec : I.slick.lifeSec;
    if (p.age > life) continue;
    if (p.kind !== 'slick') {
      const speed = p.kind === 'bouncer' ? I.bouncer.speed : I.seeker.speed;
      if (p.kind === 'seeker') {
        const pr = project(t, p.x, p.z, p.seg);
        const target = race.karts[p.target];
        let want: number;
        if (target && !target.finished && Math.hypot(target.x - p.x, target.z - p.z) < I.seeker.lockRange) want = Math.atan2(target.z - p.z, target.x - p.x);
        else {
          const ahead = pointAt(t, pr.s + I.seeker.lookAhead, target ? clamp(target.lateral, -4, 4) : 0);
          want = Math.atan2(ahead.z - p.z, ahead.x - p.x);
        }
        p.angle = wrapAngle(p.angle + clamp(wrapAngle(want - p.angle), -I.seeker.turnRate * dt, I.seeker.turnRate * dt));
      }
      p.x += Math.cos(p.angle) * speed * dt;
      p.z += Math.sin(p.angle) * speed * dt;
      const pr = project(t, p.x, p.z, p.seg);
      p.seg = pr.i;
      const wall = pr.half + t.def.shoulder - 0.6;
      if (Math.abs(pr.lateral) > wall) {
        const out = sign(pr.lateral);
        const nx = pr.tz * out;
        const nz = -pr.tx * out;
        const excess = Math.abs(pr.lateral) - wall;
        p.x -= nx * excess * 2;
        p.z -= nz * excess * 2;
        let vx = Math.cos(p.angle);
        let vz = Math.sin(p.angle);
        const vn = vx * nx + vz * nz;
        if (vn > 0) {
          vx -= 2 * vn * nx;
          vz -= 2 * vn * nz;
          p.angle = Math.atan2(vz, vx);
        }
      }
    }
    const radius = p.kind === 'bouncer' ? I.bouncer.radius : p.kind === 'seeker' ? I.seeker.radius : I.slick.radius;
    let hit = false;
    for (const k of race.karts) {
      if (k.id === p.owner && p.age < I.bouncer.armSec) continue;
      if (Math.hypot(k.x - p.x, k.z - p.z) < radius + race.rules.physics.kartRadius * 0.7) {
        hitKart(race, k, p.owner, p.kind);
        hit = true;
        break;
      }
    }
    if (!hit) keep.push(p);
  }
  // Moving items destroy slicks they run over.
  const out: Projectile[] = [];
  for (const p of keep) {
    if (p.kind === 'slick' && keep.some((q) => q.kind !== 'slick' && Math.hypot(q.x - p.x, q.z - p.z) < I.slick.radius + 1)) continue;
    if (p.kind !== 'slick' && keep.some((q) => q.kind === 'slick' && Math.hypot(q.x - p.x, q.z - p.z) < I.slick.radius + 1)) continue;
    out.push(p);
  }
  race.projectiles = out;
}

function stepBoxesAndPads(race: Race, dt: number): void {
  const I = race.rules.items;
  const t = race.track;
  for (const b of race.boxes) {
    if (b.respawn > 0) {
      b.respawn = Math.max(0, b.respawn - dt);
      continue;
    }
    for (const k of race.karts) {
      if (Math.hypot(k.x - b.x, k.z - b.z) < I.boxRadius) {
        b.respawn = I.boxRespawnSec;
        if (!k.items[1] && k.roulette <= 0) {
          k.items[1] = rollItem(race, k.place);
          k.roulette = I.rouletteSec;
          race.events.push({ type: 'pickup', kart: k.id });
        }
        break;
      }
    }
  }
  for (const pad of t.def.boostPads) {
    for (const k of race.karts) {
      let ds = k.s - pad.s;
      if (ds > t.length / 2) ds -= t.length;
      if (ds < -t.length / 2) ds += t.length;
      if (Math.abs(ds) < pad.length / 2 && Math.abs(k.lateral - pad.lateral) < 2.4 && k.boost < 0.5) giveBoost(race, k, 1.0, 'pad');
    }
  }
}

function stepDrafting(race: Race, dt: number): void {
  const D = race.rules.draft;
  for (const k of race.karts) {
    k.drafting = false;
    if (k.speed < D.minSpeed || k.spin > 0) {
      k.draft = Math.max(0, k.draft - dt * 2);
      continue;
    }
    const fx = Math.cos(k.moveAngle);
    const fz = Math.sin(k.moveAngle);
    const behind = race.karts.some((o) => {
      if (o === k) return false;
      const rx = o.x - k.x;
      const rz = o.z - k.z;
      const along = rx * fx + rz * fz;
      return along > 2.5 && along < D.range && Math.abs(rx * fz - rz * fx) < D.halfWidth;
    });
    if (behind) {
      k.drafting = true;
      k.draft += dt;
      if (k.draft >= D.chargeSec) {
        k.draft = 0;
        giveBoost(race, k, D.boostSec, 'draft');
      }
    } else k.draft = Math.max(0, k.draft - dt * 2);
  }
}

function updatePlaces(race: Race): void {
  const order = [...race.karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTick - b.finishTick;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.raceS - a.raceS;
  });
  order.forEach((k, i) => (k.place = i + 1));
}

function startLine(race: Race, k: Kart, input: Input): void {
  // Rocket start: press the drift button just before GO and hold it through. Too early stalls.
  if (input.drift && !k.prevDrift) k.startPress = race.tick;
  if (!input.drift) k.startPress = -1;
  k.prevDrift = input.drift;
  k.prevItem = input.item;
  k.prevSwap = input.swap;
}

/** Advance one tick. `input` is the player's. Events from this tick are in `race.events`. */
export function step(race: Race, input: Input = NO_INPUT): void {
  const R = race.rules;
  const dt = 1 / R.tickHz;
  race.events = [];
  if (race.tick < race.goTick) {
    for (const k of race.karts) {
      if (!k.ai) startLine(race, k, input);
      else if (race.tick === race.goTick - Math.round(R.start.rocketWindowSec * 0.5 * R.tickHz) && nextRandom(race) < R.ai.rocketChance) k.startPress = race.tick;
    }
    race.tick++;
    if (race.tick === race.goTick) {
      race.events.push({ type: 'go' });
      for (const k of race.karts) {
        const held = k.ai ? k.startPress >= 0 : input.drift && k.startPress >= 0;
        if (!held) continue;
        const early = race.goTick - k.startPress;
        if (early <= R.start.rocketWindowSec * R.tickHz) giveBoost(race, k, R.start.rocketBoostSec, 'rocket');
        else if (early >= R.start.stallBeforeSec * R.tickHz) {
          k.stall = R.start.stallSec;
          race.events.push({ type: 'stall', kart: k.id });
        }
        k.startPress = -1;
      }
    }
    return;
  }
  for (const k of race.karts) {
    const useAi = k.ai || k.finished;
    stepKart(race, k, useAi ? aiInput(race, k) : input, dt);
  }
  collideKarts(race);
  stepProjectiles(race, dt);
  stepBoxesAndPads(race, dt);
  stepDrafting(race, dt);
  const lapLen = race.track.length;
  for (const k of race.karts) {
    if (k.finished) continue;
    const lapsDone = Math.floor(k.raceS / lapLen);
    if (k.raceS >= R.laps * lapLen) {
      k.finished = true;
      k.finishTick = race.tick;
    } else if (lapsDone >= 1 && lapsDone > k.lapSeen) {
      k.lapSeen = lapsDone;
      race.events.push({ type: 'lap', kart: k.id, lap: lapsDone + 1 });
    }
  }
  updatePlaces(race);
  for (const k of race.karts) {
    if (k.finished && !k.finishSeen) {
      k.finishSeen = true;
      race.events.push({ type: 'finish', kart: k.id, place: k.place });
    }
  }
  race.tick++;
  const player = race.karts[race.player]!;
  if (player.finished || race.tick - race.goTick >= R.maxRaceSec * R.tickHz) race.over = true;
}

/** The lap a kart is on, 1-based, clamped to the race's laps. */
export const lapOf = (race: Race, k: Kart): number => clamp(Math.floor(k.raceS / race.track.length) + 1, 1, race.rules.laps);

/** Race time in seconds since GO, for a kart (its finish time once it has finished). */
export const raceTimeSec = (race: Race, k?: Kart): number => Math.max(0, ((k?.finished ? k.finishTick : race.tick) - race.goTick) / race.rules.tickHz);

/**
 * Estimated finish times for everyone, for the results board: finished karts keep their time; the rest are
 * projected from their remaining distance at their current pace.
 */
export function standings(race: Race): { kart: Kart; timeSec: number; estimated: boolean }[] {
  const total = race.rules.laps * race.track.length;
  const now = raceTimeSec(race);
  const rows = race.karts.map((k) => {
    if (k.finished) return { kart: k, timeSec: raceTimeSec(race, k), estimated: false };
    const pace = Math.max(8, k.raceS / Math.max(1, now));
    return { kart: k, timeSec: now + (total - k.raceS) / pace, estimated: true };
  });
  return rows.sort((a, b) => a.kart.place - b.kart.place);
}

/** The player's score: place first, then time. 0 until the player finishes. */
export function scoreOf(race: Race): number {
  const p = race.karts[race.player]!;
  if (!p.finished) return 0;
  const S = race.rules.score;
  const centis = Math.round(raceTimeSec(race, p) * 100);
  return (race.karts.length + 1 - p.place) * S.placeWeight + Math.max(0, S.timeCapCentis - centis);
}
