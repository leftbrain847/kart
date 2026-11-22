/**
 * Kart's rules as an app_builder GameModule. Solo mode: the race runs in the browser; on the friends host
 * the client also sends its inputs in chunks and the server replays the race from its own seed to score it.
 * Pure and deterministic: all of it lives in src/game/.
 */
import type { GameModule } from '@app-builder/host';
import config from '../app.config.json';
import { DEFAULT_RULES, TEAMS, type Rules } from './game/config';
import { MAX_CODE, expand, tickCount } from './game/replay';
import { createRace, scoreOf, step } from './game/sim';

export { DEFAULT_RULES } from './game/config';

export const REPLAY = {
  /** Most ticks in one chunk (20 s at 60 Hz). */
  maxChunkTicks: 1200,
  maxSegmentBytes: 16_384,
  maxSegments: 24,
};

export interface Run {
  seed: number;
  team: number;
  /** Every input so far, run-length encoded. */
  runs: number[];
  chunks: number;
  over: boolean;
  score: number;
}

export interface Segment {
  /** Chunk number, from 0. */
  i: number;
  team: number;
  runs: number[];
}

export const startRun = (seed: number): Run => ({ seed, team: -1, runs: [], chunks: 0, over: false, score: 0 });

/** Replays the whole race from the seed and every input so far. */
export function replay(rules: Rules, run: Run): { over: boolean; score: number; ticks: number } {
  const race = createRace(run.seed, run.team, rules);
  let ticks = 0;
  for (const input of expand(run.runs)) {
    if (race.over) break;
    step(race, input);
    ticks++;
  }
  return { over: race.over, score: scoreOf(race), ticks };
}

export function applySegment(rules: Rules, run: Run, seg: Segment): Run | null {
  if (run.over || seg.i !== run.chunks) return null;
  if (run.team === -1 ? seg.team < 0 || seg.team >= TEAMS.length : seg.team !== run.team) return null;
  const ticks = tickCount(seg.runs);
  if (ticks < 1 || ticks > REPLAY.maxChunkTicks) return null;
  const next: Run = { ...run, team: seg.team, runs: [...run.runs, ...seg.runs], chunks: run.chunks + 1 };
  const out = replay(rules, next);
  return { ...next, over: out.over, score: out.score };
}

export function parseSegment(raw: unknown): Segment | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).length !== 3) return null;
  const { i, team, runs } = r;
  if (!Number.isInteger(i) || !Number.isInteger(team) || !Array.isArray(runs) || runs.length % 2 !== 0 || runs.length === 0) return null;
  for (let k = 0; k < runs.length; k++) {
    const v = runs[k];
    if (!Number.isInteger(v)) return null;
    if (k % 2 === 0 ? (v as number) < 0 || (v as number) > MAX_CODE : (v as number) < 1 || (v as number) > REPLAY.maxChunkTicks) return null;
  }
  return { i: i as number, team: team as number, runs: runs as number[] };
}

export const app: GameModule<Rules, null, never, null> = {
  id: config.id,
  defaultConfig: DEFAULT_RULES,
  // Solo apps have no room; these limits are unused but required by the contract.
  limits: { tickHz: 0, snapshotHz: 0, minPlayers: 1, maxPlayers: 1, maxMsgBytes: 256, maxInputsPerSec: 5 },
  parseInput: () => null,
  init: () => null,
  onInput: () => undefined,
  viewFor: () => null,
  isOver: () => true,
  solo: {
    start: (_rules, seed) => startRun(seed),
    parseSegment,
    apply: (rules, run, seg) => {
      const next = applySegment(rules, run as Run, seg as Segment);
      return next ? { run: next } : { error: 'segment does not fit the rules' };
    },
    isOver: (run) => (run as Run).over,
    score: (run) => (run as Run).score,
    maxSegmentBytes: REPLAY.maxSegmentBytes,
    maxSegments: REPLAY.maxSegments,
  },
};
