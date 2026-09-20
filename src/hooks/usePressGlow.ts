import { useCallback, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Tracks the pointer inside an element by writing `--press-x` / `--press-y`,
 * which the `.press-glow` class turns into a radial highlight under the finger.
 *
 * Halcyon renders this with an AGSL `RuntimeShader` (InteractiveHighlight.kt).
 * The web needs no shader for it: a CSS radial-gradient reads the two custom
 * properties, so the per-event work is two style writes and no layout — which
 * matters because this runs on every pointerdown in a long list.
 */
export function usePressGlow<T extends Element = Element>() {
  return useCallback((event: ReactPointerEvent<T>) => {
    const element = event.currentTarget;
    // Custom properties need a stylable target; anything else could not render
    // the glow even if it were set.
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return;
    const rect = element.getBoundingClientRect();
    element.style.setProperty('--press-x', `${event.clientX - rect.left}px`);
    element.style.setProperty('--press-y', `${event.clientY - rect.top}px`);
  }, []);
}
