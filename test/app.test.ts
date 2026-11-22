import { describe, expect, it } from 'vitest';
import { app, applySegment, parseSegment, REPLAY, startRun, type Run } from '../src/app';
import { DEFAULT_RULES } from '../src/game/config';
import { decodeInput, encodeInput, expand, pushInput, tickCount } from '../src/game/replay';
import { createRace, NO_INPUT, scoreOf, step, type Input, type Race } from '../src/game/sim';
import { buildTrack, CORAL_COAST, project, pointAt } from '../src/game/track';

const autopilot = (race: Race): void => {
  race.karts[race.player]!.ai = true;
};

const runRace = (seed: number, team = 0, maxTicks = 60 * 400): Race => {
  const race = createRace(seed, team);
  autopilot(race);
  while (!race.over && race.tick < maxTicks) step(race);
  return race;
};

describe('track', () => {
  const t = buildTrack(CORAL_COAST);
  it('is a closed loop about a kilometre long, sampled every metre', () => {
    expect(t.length).toBeGreaterThan(900);
    expect(t.length).toBeLessThan(1300);
    expect(Math.abs(t.samples.length - t.length)).toBeLessThan(2);
  });
  it('projects a point beside the road back to its distance and sideways offset', () => {
    const p = pointAt(t, 300, 4);
    const pr = project(t, p.x, p.z, -1);
    expect(pr.s).toBeCloseTo(300, 0);
    expect(pr.lateral).toBeCloseTo(4, 0);
  });
  it('keeps distant stretches of road apart (no overlapping corners)', () => {
    const S = t.samples;
    for (let i = 0; i < S.length; i += 4)
      for (let j = i + 4; j < S.length; j += 4) {
        const ds = Math.min(S[j]!.s - S[i]!.s, t.length - (S[j]!.s - S[i]!.s));
        if (ds < 80) continue;
        expect(Math.hypot(S[i]!.x - S[j]!.x, S[i]!.z - S[j]!.z)).toBeGreaterThan(S[i]!.half + S[j]!.half + 2 * CORAL_COAST.shoulder);
      }
  });
});

describe('race', () => {
  it('nobody moves before GO', () => {
    const race = createRace(5);
    const start = race.karts.map((k) => [k.x, k.z]);
    for (let i = 0; i < race.goTick - 1; i++) step(race, { ...NO_INPUT, steer: 1 });
    race.karts.forEach((k, i) => expect([k.x, k.z]).toEqual(start[i]));
  });

  it('is deterministic: same seed and inputs, same race', () => {
    const a = runRace(77, 2, 60 * 30);
    const b = runRace(77, 2, 60 * 30);
    expect(a.karts.map((k) => [k.x, k.z, k.speed])).toEqual(b.karts.map((k) => [k.x, k.z, k.speed]));
  });

  it('a full race finishes: every lap counted, places 1..8, a positive score', () => {
    const race = runRace(1234, 1);
    expect(race.over).toBe(true);
    const p = race.karts[race.player]!;
    expect(p.finished).toBe(true);
    expect(race.karts.map((k) => k.place).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(scoreOf(race)).toBeGreaterThan(0);
    // A full race at kart speeds takes about two minutes.
    const sec = (p.finishTick - race.goTick) / DEFAULT_RULES.tickHz;
    expect(sec).toBeGreaterThan(80);
    expect(sec).toBeLessThan(200);
  });

  it('AI karts race cleanly: rarely on the grass, rarely into walls', () => {
    const race = createRace(9, 3);
    autopilot(race);
    let walls = 0;
    let offroad = 0;
    let ticks = 0;
    while (!race.over && race.tick < 60 * 400) {
      step(race);
      ticks++;
      walls += race.events.filter((e) => e.type === 'wall').length;
      offroad += race.karts.filter((k) => k.offroad).length;
    }
    expect(walls).toBeLessThan(40);
    expect(offroad / (ticks * race.karts.length)).toBeLessThan(0.08);
  });

  it('a drift held long enough pays out a mini-turbo on release', () => {
    const race = createRace(3);
    const k = race.karts[race.player]!;
    while (race.tick < race.goTick + 120) step(race, NO_INPUT); // get up to speed on the straight
    const boosts: string[] = [];
    for (let i = 0; i < 70; i++) {
      step(race, { ...NO_INPUT, steer: 0.5, drift: true });
      for (const e of race.events) if (e.type === 'spark') boosts.push(`spark${e.tier}`);
    }
    expect(k.drift).toBe(1);
    expect(k.tier).toBeGreaterThanOrEqual(1);
    step(race, NO_INPUT);
    expect(race.events.some((e) => e.type === 'boost' && e.kart === k.id && e.why === 'turbo')).toBe(true);
    expect(k.boost).toBeGreaterThan(0);
  });

  it('the e-brake slows the kart and turns it tighter than steering alone', () => {
    const turn = (brake: boolean): { speed: number; turned: number } => {
      const race = createRace(6);
      const k = race.karts[race.player]!;
      while (race.tick < race.goTick + 150) step(race, NO_INPUT);
      const h0 = k.heading;
      for (let i = 0; i < 30; i++) step(race, { ...NO_INPUT, steer: 1, brake });
      return { speed: k.speed, turned: Math.abs(Math.atan2(Math.sin(k.heading - h0), Math.cos(k.heading - h0))) };
    };
    const plain = turn(false);
    const braked = turn(true);
    expect(braked.speed).toBeLessThan(plain.speed);
    expect(braked.speed).toBeGreaterThanOrEqual(DEFAULT_RULES.physics.brakeMinSpeed);
    expect(braked.turned).toBeGreaterThan(plain.turned);
  });

  it('rocket start: pressing just before GO boosts, pressing far too early stalls', () => {
    const rocket = createRace(4);
    for (let t = 0; t < rocket.goTick; t++) step(rocket, { ...NO_INPUT, drift: t >= rocket.goTick - 10 });
    expect(rocket.karts[rocket.player]!.boost).toBeGreaterThan(0);
    const stall = createRace(4);
    for (let t = 0; t < stall.goTick; t++) step(stall, { ...NO_INPUT, drift: true });
    expect(stall.karts[stall.player]!.stall).toBeGreaterThan(0);
  });

  it('swapping riders swaps their items; only the back rider throws', () => {
    const race = createRace(8);
    const k = race.karts[race.player]!;
    while (race.tick < race.goTick) step(race);
    k.items = ['nitro', null];
    step(race, { ...NO_INPUT, item: true });
    expect(k.items[0]).toBe('nitro'); // the front rider can't use it
    step(race, NO_INPUT);
    step(race, { ...NO_INPUT, swap: true });
    expect(k.items).toEqual([null, 'nitro']);
    expect(k.swapped).toBe(true);
    step(race, { ...NO_INPUT, item: true });
    expect(k.items[1]).toBeNull();
    expect(k.boost).toBeGreaterThan(0);
  });

  it('a bouncer fired at a kart ahead spins it out', () => {
    const race = createRace(2);
    while (race.tick < race.goTick + 30) step(race);
    const me = race.karts[race.player]!;
    const victim = race.karts.find((o) => o.id !== me.id)!;
    victim.x = me.x + Math.cos(me.heading) * 12;
    victim.z = me.z + Math.sin(me.heading) * 12;
    victim.ai = false; // park it
    victim.speed = 0;
    me.items = [null, 'bouncer'];
    let hit = false;
    step(race, { ...NO_INPUT, item: true });
    for (let i = 0; i < 30 && !hit; i++) {
      step(race);
      hit = race.events.some((e) => e.type === 'hit' && e.by === me.id);
    }
    expect(hit).toBe(true);
  });
});

describe('replay', () => {
  it('encodes and decodes every input state', () => {
    for (const steer of [-1, -0.5, 0, 0.25, 1])
      for (const drift of [false, true]) {
        const i: Input = { steer, drift, item: !drift, swap: drift, brake: !drift };
        expect(decodeInput(encodeInput(i))).toEqual(i);
      }
  });
  it('run-length encodes held inputs', () => {
    const runs: number[] = [];
    for (let t = 0; t < 100; t++) pushInput(runs, { ...NO_INPUT, steer: t < 60 ? 0 : 1 });
    expect(runs.length).toBe(4);
    expect(tickCount(runs)).toBe(100);
    expect([...expand(runs)].length).toBe(100);
  });

  it('the server replays a played race to the same score the client shows', () => {
    // Play as the client: record what the player pressed (a simple scripted driver), in chunks.
    const seed = 4242;
    const team = 2;
    const race = createRace(seed, team);
    const chunks: number[][] = [[]];
    const me = race.karts[race.player]!;
    while (!race.over && race.tick < 60 * 400) {
      // A simple pure-pursuit driver standing in for a thumb on the screen.
      const target = pointAt(race.track, me.s + 14);
      let diff = Math.atan2(target.z - me.z, target.x - me.x) - me.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const input: Input = { steer: Math.max(-1, Math.min(1, diff * 2.5)), drift: false, item: race.tick % 300 === 0, swap: race.tick % 700 === 0, brake: Math.abs(diff) > 0.5 };
      step(race, input);
      let last = chunks[chunks.length - 1]!;
      if (tickCount(last) >= REPLAY.maxChunkTicks) chunks.push((last = []));
      pushInput(last, input);
    }
    let run: Run = startRun(seed);
    const solo = app.solo!;
    for (let i = 0; i < chunks.length; i++) {
      const seg = solo.parseSegment(JSON.parse(JSON.stringify({ i, team, runs: chunks[i] })));
      expect(seg).not.toBeNull();
      expect(JSON.stringify(seg).length).toBeLessThan(REPLAY.maxSegmentBytes);
      const out = solo.apply(app.defaultConfig, run, seg!);
      if ('error' in out) throw new Error(out.error);
      run = out.run as Run;
    }
    expect(chunks.length).toBeLessThanOrEqual(REPLAY.maxSegments);
    expect(solo.score(run)).toBe(scoreOf(race));
    expect(solo.isOver(run)).toBe(race.over);
  });

  it('rejects malformed or out-of-order segments', () => {
    for (const bad of [null, [], { i: 0, team: 0 }, { i: 0, team: 0, runs: [1] }, { i: 0, team: 0, runs: [300, 1] }, { i: 0, team: 0, runs: [1, 0] }, { i: 0, team: 0, runs: [1, 2], x: 1 }, { i: '0', team: 0, runs: [1, 2] }])
      expect(parseSegment(bad)).toBeNull();
    const run = startRun(1);
    expect(applySegment(DEFAULT_RULES, run, { i: 1, team: 0, runs: [4, 10] })).toBeNull();
    expect(applySegment(DEFAULT_RULES, run, { i: 0, team: 9, runs: [4, 10] })).toBeNull();
    const first = applySegment(DEFAULT_RULES, run, { i: 0, team: 1, runs: [4, 10] })!;
    expect(first.chunks).toBe(1);
    expect(applySegment(DEFAULT_RULES, first, { i: 1, team: 2, runs: [4, 10] })).toBeNull(); // can't change crew
  });
});
