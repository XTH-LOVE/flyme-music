/**
 * A spring, solved in closed form.
 *
 * Ported from the solver AMLL uses (itself MIT, from github.com/pushkine),
 * because the lyrics scroller needs something CSS transitions cannot do: the
 * target changes while the motion is still in flight. A transition restarts
 * from zero velocity each time and visibly stutters when a song's lines arrive
 * faster than the animation; a spring carries its velocity through and simply
 * bends toward the new target.
 *
 * Solved analytically rather than stepped: `solveSpring` returns a function of
 * time, so a frame is one `Math.exp` rather than an integration, and the result
 * does not drift with a variable frame rate.
 *
 * The caller owns the clock. `update` takes the elapsed seconds and does not
 * read `performance.now()` itself, which is what makes this testable.
 */

export interface SpringParams {
  /** Heavier settles slower and overshoots less. Default 1. */
  mass?: number;
  /** Higher means less bounce. Default 10. */
  damping?: number;
  /** Higher means faster. Default 100. */
  stiffness?: number;
  /**
   * Forces the critically-damped branch, which never overshoots. Used when
   * bouncing would read as a glitch - a seek, or a jump the user asked for.
   */
  soft?: boolean;
}

const DEFAULT_MASS = 1;
const DEFAULT_DAMPING = 10;
const DEFAULT_STIFFNESS = 100;

/**
 * Position at time `t`, for a spring released at `from` with `velocity` toward
 * `to`.
 *
 * Two branches, chosen by the damping ratio: at or above critical damping the
 * motion is a single exponential decay, below it a decaying oscillation. Both
 * are the standard solutions; neither is approximated.
 */
export function solveSpring(
  from: number,
  velocity: number,
  to: number,
  params: SpringParams = {},
): (t: number) => number {
  const mass = params.mass ?? DEFAULT_MASS;
  const damping = params.damping ?? DEFAULT_DAMPING;
  const stiffness = params.stiffness ?? DEFAULT_STIFFNESS;
  const delta = to - from;

  // At or past critical damping, the oscillation term vanishes and the general
  // solution collapses to this; taking it separately avoids a divide by zero.
  if (params.soft || damping >= 2 * Math.sqrt(stiffness * mass)) {
    const omega = -Math.sqrt(stiffness / mass);
    const leftover = -omega * delta - velocity;
    return (t: number) => to - (delta + t * leftover) * Math.E ** (t * omega);
  }

  const dampedFrequency = Math.sqrt(4 * mass * stiffness - damping ** 2);
  const leftover = (damping * delta - 2 * mass * velocity) / dampedFrequency;
  const freq = (0.5 * dampedFrequency) / mass;
  const decay = -(0.5 * damping) / mass;
  return (t: number) =>
    to -
    (Math.cos(t * freq) * delta + Math.sin(t * freq) * leftover) * Math.E ** (t * decay);
}

/** How close counts as arrived. Well under a pixel, so it is never visible. */
const REST_POSITION = 0.01;
const REST_VELOCITY = 0.01;

export class Spring {
  private solver: (t: number) => number;
  private t = 0;
  private params: SpringParams;
  private target: number;

  constructor(position = 0, params: SpringParams = {}) {
    this.target = position;
    this.params = params;
    this.solver = () => position;
  }

  /** Where it is now. */
  get position(): number {
    return this.solver(this.t);
  }

  /** Where it is heading. */
  get targetPosition(): number {
    return this.target;
  }

  /**
   * Whether it has settled.
   *
   * Velocity is read from the solver rather than tracked, so it is exact at the
   * moment asked rather than one frame stale.
   */
  get settled(): boolean {
    return (
      Math.abs(this.targetPosition - this.position) < REST_POSITION &&
      Math.abs(this.velocity()) < REST_VELOCITY
    );
  }

  /**
   * Aim at a new position, keeping the current velocity.
   *
   * This is the whole reason for the closed form: the spring bends toward the
   * new target from wherever it is and however fast it is going, instead of
   * restarting.
   */
  setTarget(target: number, params?: SpringParams): void {
    if (params) this.params = { ...this.params, ...params };
    if (target === this.target) return;
    /*
     * Position and velocity are read before the clock is reset. Reading either
     * afterwards gives the value at t=0 of the *new* solver, which is the old
     * release point - so the spring would snap back to where it started instead
     * of continuing from where it is. The tests caught this; it is invisible
     * until the target changes mid-flight, which is the only time it matters.
     */
    const position = this.position;
    const velocity = this.velocity();
    this.target = target;
    this.t = 0;
    this.solver = solveSpring(position, velocity, target, this.params);
  }

  /** Snap, with no motion. For a seek or a fresh track. */
  reset(position: number): void {
    this.target = position;
    this.t = 0;
    this.solver = () => position;
  }

  /** Advance by `dt` seconds. */
  update(dt: number): void {
    if (!(dt > 0)) return;
    // A long stall - a backgrounded tab, a paused render loop - must not be
    // integrated in one step, or the spring jumps to its target and the motion
    // is simply lost.
    this.t += Math.min(dt, 0.064);
    // Freeze once it has arrived: the solver stays at the target, so a frame
    // costs a subtraction instead of a `Math.exp` for as long as nothing moves.
    if (this.settled) {
      this.t = 0;
      this.solver = () => this.target;
    }
  }

  /** Numerical derivative, good enough for reading a velocity. */
  private velocity(): number {
    const h = 1 / 240;
    return (this.solver(this.t + h) - this.solver(this.t)) / h;
  }
}
