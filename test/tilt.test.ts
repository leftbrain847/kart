import { describe, expect, it } from 'vitest';
import { angleDiff, wheelAngle } from '../src/client/controls';

/**
 * deviceorientation beta/gamma for a phone turned clockwise by `turn` degrees (as you look at the screen; 0 = upright
 * portrait, 90 = landscape) and tipped back by `pitch` degrees (screen facing up more; 90 = flat on a table).
 */
function pose(turn: number, pitch: number): [number, number] {
  const r = (turn * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  // The world's up vector in the phone's own axes (x right, y up, z out of the screen in portrait).
  const ux = -Math.cos(p) * Math.sin(r);
  const uy = Math.cos(p) * Math.cos(r);
  const uz = Math.sin(p);
  return [(Math.asin(uy) * 180) / Math.PI, (Math.atan2(-ux, uz) * 180) / Math.PI];
}

/** The steering the game reads (degrees from straight ahead, + = right), as in Controls.onTilt. */
const steerDeg = (neutral: [number, number], now: [number, number]): number => angleDiff(wheelAngle(...neutral)!, wheelAngle(...now)!);

describe('tilt steering (phone as a steering wheel)', () => {
  it('in landscape, tipping the top of the phone toward or away from you does not steer', () => {
    const start = pose(90, 30);
    for (const pitch of [5, 15, 45, 60]) expect(Math.abs(steerDeg(start, pose(90, pitch)))).toBeLessThan(0.01);
    const other = pose(-90, 30); // landscape the other way round
    for (const pitch of [5, 45, 60]) expect(Math.abs(steerDeg(other, pose(-90, pitch)))).toBeLessThan(0.01);
  });

  it('turning the phone clockwise steers right, anticlockwise steers left, in every grip', () => {
    for (const grip of [0, 90, -90]) {
      const start = pose(grip, 35);
      expect(steerDeg(start, pose(grip + 20, 35))).toBeCloseTo(20, 5);
      expect(steerDeg(start, pose(grip - 20, 35))).toBeCloseTo(-20, 5);
      // ...even while tipping it at the same time.
      expect(steerDeg(start, pose(grip + 20, 55))).toBeCloseTo(20, 5);
    }
  });

  it('ignores a phone lying flat, where the wheel angle means nothing', () => {
    expect(wheelAngle(...pose(90, 89))).toBeNull();
    expect(wheelAngle(...pose(90, 40))).not.toBeNull();
  });

  it('wraps angles across the ±180° seam', () => {
    expect(angleDiff(170, -170)).toBeCloseTo(-20);
    expect(angleDiff(-170, 170)).toBeCloseTo(20);
  });
});
