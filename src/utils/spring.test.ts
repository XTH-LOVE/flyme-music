import { describe, expect, it } from 'vitest';
import { Spring, solveSpring } from './spring';

/** Run a spring for `seconds` in 60fps steps and return where it ended. */
function run(spring: Spring, seconds: number): number {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) spring.update(1 / 60);
  return spring.position;
}

describe('solveSpring', () => {
  it('starts where it was released from', () => {
    expect(solveSpring(0, 0, 100)(0)).toBeCloseTo(0, 6);
  });

  it('ends at the target', () => {
    expect(solveSpring(0, 0, 100)(5)).toBeCloseTo(100, 3);
  });

  it('carries an initial velocity instead of discarding it', () => {
    // Released at 0 heading toward 100 at speed: after a moment it must be past
    // where a spring released from rest would be.
    const moving = solveSpring(0, 500, 100)(0.05);
    const resting = solveSpring(0, 0, 100)(0.05);
    expect(moving).toBeGreaterThan(resting);
  });

  it('never overshoots when soft', () => {
    const soft = solveSpring(0, 0, 100, { soft: true });
    for (let t = 0; t < 2; t += 1 / 240) {
      expect(soft(t)).toBeLessThanOrEqual(100 + 1e-6);
    }
  });

  it('does overshoot with the default bounce, which is the point', () => {
    const bouncy = solveSpring(0, 0, 100, { stiffness: 200, damping: 12 });
    let peak = 0;
    for (let t = 0; t < 2; t += 1 / 240) peak = Math.max(peak, bouncy(t));
    expect(peak).toBeGreaterThan(100);
  });

  it('takes the critically-damped branch without dividing by zero', () => {
    // damping exactly at the critical value: the sqrt under the oscillation
    // branch would be zero here.
    const critical = 2 * Math.sqrt(100 * 1);
    expect(() => solveSpring(0, 0, 10, { damping: critical })(0.1)).not.toThrow();
    expect(solveSpring(0, 0, 10, { damping: critical })(5)).toBeCloseTo(10, 3);
  });
});

describe('Spring', () => {
  it('settles on its target', () => {
    const s = new Spring(0, { stiffness: 170, damping: 26 });
    s.setTarget(300);
    expect(run(s, 3)).toBeCloseTo(300, 2);
    expect(s.settled).toBe(true);
  });

  it('does not jump when the target changes mid-flight', () => {
    const s = new Spring(0, { stiffness: 170, damping: 26 });
    s.setTarget(300);
    run(s, 0.1);
    const before = s.position;
    s.setTarget(-300);
    // The whole point of the closed form: position is continuous across a
    // retarget, only the direction changes.
    expect(s.position).toBeCloseTo(before, 6);
  });

  it('carries velocity across a retarget, so a reversal is not instant', () => {
    const s = new Spring(0, { stiffness: 170, damping: 26 });
    s.setTarget(300);
    run(s, 0.15);
    const movingUp = s.position;
    s.setTarget(-300);
    // Still travelling the old way for a moment, then it comes back.
    expect(s.position).toBeGreaterThanOrEqual(movingUp - 0.5);
    expect(run(s, 3)).toBeCloseTo(-300, 2);
  });

  it('clamps a long frame instead of teleporting', () => {
    const s = new Spring(0, { stiffness: 90, damping: 15 });
    s.setTarget(1000);
    // A tab that was backgrounded for a second must not arrive in one step.
    s.update(1);
    expect(s.position).toBeLessThan(1000);
  });

  it('ignores a non-positive delta', () => {
    const s = new Spring(0);
    s.setTarget(100);
    run(s, 0.2);
    const before = s.position;
    s.update(0);
    s.update(-1);
    expect(s.position).toBe(before);
  });

  it('snaps without motion on reset', () => {
    const s = new Spring(0);
    s.setTarget(500);
    run(s, 0.1);
    s.reset(42);
    expect(s.position).toBe(42);
    expect(s.settled).toBe(true);
  });

  it('costs nothing once it has settled', () => {
    const s = new Spring(0);
    s.setTarget(10);
    run(s, 3);
    // Frozen: further frames must not move it at all.
    expect(run(s, 1)).toBe(10);
  });
});
