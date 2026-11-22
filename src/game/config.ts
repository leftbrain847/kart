/**
 * Every tunable number in the race. The sim (src/game/sim.ts) reads only these, so balancing is a config edit.
 * Units: metres, seconds, radians. The sim runs at a fixed `tickHz`.
 */

export interface TeamStats {
  /** Top speed on road, m/s. */
  topSpeed: number;
  /** Acceleration, m/s². */
  accel: number;
  /** Turn rate at speed, rad/s. */
  handling: number;
  /** Collision weight: heavier karts shove lighter ones. */
  weight: number;
}

export interface Rider {
  name: string;
  /** Body colour (hex). */
  color: number;
  /** Head/helmet colour (hex). */
  accent: number;
  /** Shape of the rider's head in the renderer. */
  head: 'round' | 'ears' | 'antenna' | 'crest';
}

export interface Team {
  id: string;
  name: string;
  /** Kart body colour (hex). */
  kart: number;
  riders: [Rider, Rider];
  stats: TeamStats;
}

export type ItemKind = 'nitro' | 'bouncer' | 'seeker' | 'slick';

export const ITEM_KINDS: readonly ItemKind[] = ['nitro', 'bouncer', 'seeker', 'slick'];

export interface Rules {
  tickHz: number;
  laps: number;
  karts: number;
  /** Seconds of countdown before GO. */
  countdownSec: number;
  /** A race the player never finishes ends here, in seconds after GO. */
  maxRaceSec: number;
  /** Player's grid slot (0 = pole). */
  playerGridSlot: number;
  grid: { rowGap: number; laneOffset: number; firstRowBack: number };
  physics: {
    kartRadius: number;
    /** Below this speed steering fades out. */
    steerFullSpeed: number;
    /** Steering at top speed is multiplied by (1 - this). */
    highSpeedSteerLoss: number;
    /** How fast the travel direction follows the body, 1/s (grip). */
    grip: number;
    driftGrip: number;
    /** Angle between body and travel while drifting. */
    driftSlip: number;
    driftMinSpeed: number;
    driftMinSteer: number;
    /** Drift turn rate = handling × (base + range × steer-into-drift 0..1). */
    driftTurnBase: number;
    driftTurnRange: number;
    /** Speed cap while drifting, × top speed. */
    driftSpeedFactor: number;
    hopSec: number;
    hopHeight: number;
    /** Charge seconds for spark tiers 1/2/3 (blue, orange, violet). */
    sparkTiers: [number, number, number];
    /** Mini-turbo seconds per tier. */
    turboSec: [number, number, number];
    /** Charge rate = base + range × steer-into-drift. */
    chargeBase: number;
    chargeRange: number;
    /** Speed cap × this while boosting. */
    boostSpeedFactor: number;
    boostAccel: number;
    /** Above the cap, speed sinks toward it at this rate, 1/s. */
    overspeedDecay: number;
    offroadSpeedFactor: number;
    wallSpeedKeep: number;
    /** Kart-to-kart bump: share of closing speed swapped. */
    bumpTransfer: number;
    spinSec: number;
    slickSpinSec: number;
    /** Speed kept per second while spinning out. */
    spinSpeedKeepPerSec: number;
    invulnSec: number;
    swapCooldownSec: number;
  };
  draft: { range: number; halfWidth: number; minSpeed: number; chargeSec: number; boostSec: number; speedFactor: number };
  start: {
    /** Press the drift/boost button within this many seconds before GO (and hold) for a rocket start. */
    rocketWindowSec: number;
    rocketBoostSec: number;
    /** Pressing earlier than this before GO stalls the kart. */
    stallBeforeSec: number;
    stallSec: number;
  };
  items: {
    rouletteSec: number;
    boxRespawnSec: number;
    boxRadius: number;
    nitroSec: number;
    bouncer: { speed: number; lifeSec: number; radius: number; armSec: number };
    seeker: { speed: number; lifeSec: number; radius: number; turnRate: number; lockRange: number; lookAhead: number };
    slick: { lifeSec: number; radius: number; dropBack: number };
    maxProjectiles: number;
    /** Odds per item, by the picker's place bucket (lead, front, middle, back). */
    odds: Record<'lead' | 'front' | 'middle' | 'back', Record<ItemKind, number>>;
  };
  ai: {
    /** Each AI's top speed is scaled by a value in this range (seeded). */
    skill: [number, number];
    lookAheadBase: number;
    lookAheadPerSpeed: number;
    steerGain: number;
    /** Lane weave amplitude, m. */
    laneAmplitude: number;
    /** Metres toward the inside per radian of curvature ahead, and the most. */
    insideBias: number;
    insideMax: number;
    /** Curvature over the next stretch (rad) that makes an AI drift. */
    driftCurve: number;
    /** Rubber band: catch-up / ease-off as a fraction of top speed, and the gaps (m) where they apply. */
    catchUp: number;
    catchUpGap: number;
    easeOff: number;
    easeOffGap: number;
    rocketChance: number;
    /** Chance per second of using an item when the situation fits. */
    itemUsePerSec: number;
  };
  score: { placeWeight: number; timeCapCentis: number };
}

export const DEFAULT_RULES: Rules = {
  tickHz: 60,
  laps: 3,
  karts: 8,
  countdownSec: 3,
  maxRaceSec: 360,
  playerGridSlot: 5,
  grid: { rowGap: 6, laneOffset: 3.4, firstRowBack: 6 },
  physics: {
    kartRadius: 1.15,
    steerFullSpeed: 9,
    highSpeedSteerLoss: 0.22,
    grip: 9,
    driftGrip: 5,
    driftSlip: 0.32,
    driftMinSpeed: 11,
    driftMinSteer: 0.25,
    driftTurnBase: 0.3,
    driftTurnRange: 0.95,
    driftSpeedFactor: 0.97,
    hopSec: 0.22,
    hopHeight: 0.45,
    sparkTiers: [0.75, 1.6, 2.6],
    turboSec: [0.55, 1.0, 1.5],
    chargeBase: 0.65,
    chargeRange: 0.7,
    boostSpeedFactor: 1.32,
    boostAccel: 30,
    overspeedDecay: 1.6,
    offroadSpeedFactor: 0.5,
    wallSpeedKeep: 0.72,
    bumpTransfer: 0.35,
    spinSec: 1.15,
    slickSpinSec: 0.85,
    spinSpeedKeepPerSec: 0.12,
    invulnSec: 1.4,
    swapCooldownSec: 0.55,
  },
  draft: { range: 13, halfWidth: 2.4, minSpeed: 16, chargeSec: 1.3, boostSec: 0.9, speedFactor: 1.12 },
  start: { rocketWindowSec: 0.4, rocketBoostSec: 1.3, stallBeforeSec: 1.1, stallSec: 0.9 },
  items: {
    rouletteSec: 1.0,
    boxRespawnSec: 1.6,
    boxRadius: 1.9,
    nitroSec: 1.35,
    bouncer: { speed: 46, lifeSec: 6, radius: 1.5, armSec: 0.45 },
    seeker: { speed: 43, lifeSec: 11, radius: 1.5, turnRate: 4.5, lockRange: 28, lookAhead: 14 },
    slick: { lifeSec: 30, radius: 1.5, dropBack: 2.6 },
    maxProjectiles: 32,
    odds: {
      lead: { nitro: 10, bouncer: 40, seeker: 0, slick: 50 },
      front: { nitro: 25, bouncer: 35, seeker: 15, slick: 25 },
      middle: { nitro: 35, bouncer: 25, seeker: 30, slick: 10 },
      back: { nitro: 50, bouncer: 10, seeker: 40, slick: 0 },
    },
  },
  ai: {
    skill: [0.92, 0.985],
    lookAheadBase: 7,
    lookAheadPerSpeed: 0.45,
    steerGain: 2.6,
    laneAmplitude: 3.2,
    insideBias: 2.5,
    insideMax: 2.5,
    driftCurve: 0.55,
    catchUp: 0.07,
    catchUpGap: 55,
    easeOff: 0.06,
    easeOffGap: 70,
    rocketChance: 0.5,
    itemUsePerSec: 1.2,
  },
  score: { placeWeight: 100_000, timeCapCentis: 99_999 },
};

/** Four original two-rider crews. Stats trade speed against grip and weight. */
export const TEAMS: Team[] = [
  {
    id: 'comet',
    name: 'Comet Crew',
    kart: 0xff4d3d,
    riders: [
      { name: 'Pip', color: 0xffd23f, accent: 0xff4d3d, head: 'round' },
      { name: 'Zuzu', color: 0x3ddcff, accent: 0xffffff, head: 'antenna' },
    ],
    stats: { topSpeed: 28, accel: 15, handling: 2.15, weight: 2 },
  },
  {
    id: 'moss',
    name: 'Moss Rollers',
    kart: 0x3fbf5a,
    riders: [
      { name: 'Bramble', color: 0x8a5a2b, accent: 0x3fbf5a, head: 'ears' },
      { name: 'Fen', color: 0xb6f05a, accent: 0x2d6b35, head: 'round' },
    ],
    stats: { topSpeed: 27, accel: 18, handling: 2.35, weight: 1 },
  },
  {
    id: 'brass',
    name: 'Brass Bulls',
    kart: 0xffb000,
    riders: [
      { name: 'Hob', color: 0x7a4bff, accent: 0xffb000, head: 'crest' },
      { name: 'Grit', color: 0x6b6b7a, accent: 0xff7a00, head: 'ears' },
    ],
    stats: { topSpeed: 29.2, accel: 13, handling: 1.95, weight: 3 },
  },
  {
    id: 'tide',
    name: 'Tide Twins',
    kart: 0x2f7bff,
    riders: [
      { name: 'Coral', color: 0xff7ab8, accent: 0x2f7bff, head: 'crest' },
      { name: 'Kelp', color: 0x2dd4bf, accent: 0x0b3d91, head: 'antenna' },
    ],
    stats: { topSpeed: 28.4, accel: 16, handling: 2.05, weight: 2 },
  },
];
