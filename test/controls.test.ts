import { describe, expect, it } from 'vitest';
import { CONTROLS, dragToSteer } from '../src/client/controls';

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
  it('rises steadily with the drag', () => {
    let last = 0;
    for (let dx = 0; dx <= CONTROLS.steerRangePx; dx += 5) {
      const v = dragToSteer(dx);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});
