/**
 * Shared-element handoff for View Transitions: the caller records which
 * entity is about to navigate, both pages tag their cover with the same
 * `view-transition-name`, and the browser morphs the artwork across the
 * route change. No-ops naturally on engines without View Transitions API
 * (React Router's viewTransition option falls back to a plain navigation).
 */

let coverTargetId: string | null = null;

/** Call right before navigating to a detail page. */
export function markCoverTransition(entityId: string): void {
  coverTargetId = entityId;
}

/** Forget after the transition completes (route change re-renders both). */
export function clearCoverTransition(): void {
  coverTargetId = null;
}

/**
 * The view-transition-name for a cover, or undefined when this element is
 * not the transition source/target. Unique naming is per page, so only the
 * clicked card and the opened detail hero ever carry it.
 */
export function coverTransitionName(entityId: string | undefined): string | undefined {
  return entityId && coverTargetId === entityId ? 'vt-pl-cover' : undefined;
}
