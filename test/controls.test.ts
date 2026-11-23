import { describe, expect, it } from 'vitest';
import { CONTROLS, dragToSteer } from '../src/client/controls';
import { quantiseSteer } from '../src/game/sim';

describe('thumb steering', () => {
  it('ignores tiny wobbles inside the dead zone', () => {
    expect(dragToSteer(CONTROLS.deadZonePx)).toBe(0);
    expect(dragToSteer(-CONTROLS.deadZonePx + 1)).toBe(0);
  });
  it('is gentle for small drags and reaches full lock only at the end of the range', () => {
    const quarter = CONTROLS.deadZonePx + (CONTROLS.steerRangePx - CONTROLS.deadZonePx) / 4;
    expect(dragToSteer(quarter)).toBeLessThan(0.15);
    expect(dragToSteer(CONTROLS.steerRangePx * 0.6)).toBeLessThan(0.6);
    expect(dragToSteer(CONTROLS.steerRangePx)).toBe(1);
    expect(dragToSteer(-CONTROLS.steerRangePx * 2)).toBe(-1);
  });
  it('the sensitivity slider scales how far you drag for full lock', () => {
    const half = CONTROLS.steerRangePx / 2;
    expect(dragToSteer(half, 2)).toBe(1); // double sensitivity: full lock at half the drag
    expect(dragToSteer(half, 1)).toBeLessThan(0.5);
    expect(dragToSteer(CONTROLS.steerRangePx, 0.5)).toBeLessThan(0.5); // half sensitivity: calmer
    expect(dragToSteer(half, 99)).toBe(dragToSteer(half, 2)); // clamped to the slider's range
  });

  it('gentle corrections survive into the race: the sim steers in sixteenths, not quarters', () => {
    expect(quantiseSteer(0.07)).toBeCloseTo(0.0625);
    expect(quantiseSteer(0.2)).toBeCloseTo(0.1875);
  });

  it('rises steadily with the drag', () => {
    let last = 0;
    for (let dx = 0; dx <= CONTROLS.steerRangePx; dx += 5) {
      const v = dragToSteer(dx);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});
