/** Seeded PRNG (mulberry32). The sim's only source of randomness, so a seed + inputs replay exactly. */
export const nextRandom = (state: { rng: number }): number => {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
