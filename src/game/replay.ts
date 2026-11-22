/**
 * The player's inputs as a compact run-length list, one entry per held state. The client sends them in chunks;
 * the server replays the whole race from the seed and the chunks so far, so the score is the server's.
 */
import type { Input } from './sim';
import { quantiseSteer } from './sim';

/** One input state as a small integer: steer index 0..8, then drift, item, swap and brake bits. */
export const encodeInput = (i: Input): number => (Math.round(quantiseSteer(i.steer) * 4) + 4) | (i.drift ? 16 : 0) | (i.item ? 32 : 0) | (i.swap ? 64 : 0) | (i.brake ? 128 : 0);

export const decodeInput = (code: number): Input => ({ steer: ((code & 15) - 4) / 4, drift: (code & 16) !== 0, item: (code & 32) !== 0, swap: (code & 64) !== 0, brake: (code & 128) !== 0 });

export const MAX_CODE = 255;

/** Appends one tick's input to a run list [code, count, code, count, ...]. */
export function pushInput(runs: number[], input: Input): void {
  const code = encodeInput(input);
  const n = runs.length;
  if (n >= 2 && runs[n - 2] === code) runs[n - 1]! += 1;
  else runs.push(code, 1);
}

export function* expand(runs: readonly number[]): Generator<Input> {
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const input = decodeInput(runs[i]!);
    for (let c = 0; c < runs[i + 1]!; c++) yield input;
  }
}

export const tickCount = (runs: readonly number[]): number => {
  let n = 0;
  for (let i = 1; i < runs.length; i += 2) n += runs[i]!;
  return n;
};
