import { useEffect, useState } from 'react';
import './splash.css';

/**
 * The first thing drawn, and the last thing to disappear.
 *
 * It waits for the app to be usable rather than for a fixed number of seconds.
 * A timer is the usual implementation and it is wrong in both directions: on a
 * fast device it is a delay for nothing, and on a slow one it uncovers a
 * half-rendered interface anyway. It is capped, because being stuck on a splash
 * screen is worse than seeing something unfinished - the user concludes the app
 * has hung.
 */
const MAX_MS = 1200;
/** Below this it reads as a flicker rather than a screen. */
const MIN_MS = 350;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    /*
     * One frame past the mount, so the route underneath has painted - and
     * nothing else.
     *
     * This used to wait for `document.fonts.ready` as well, on the reasoning
     * that the wordmark would otherwise appear in the wrong typeface and then
     * reflow. It does not: the font is declared with `font-display: swap`, so
     * it shows in the fallback immediately and is replaced when it arrives.
     * Waiting bought nothing and cost whatever the font took to download -
     * which became visible the moment the app started shipping a font, and
     * turned a screen that should be a beat into a screen that lasted seconds.
     */
    const ready = new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    void ready.then(() => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_MS - (Date.now() - started));
      window.setTimeout(() => {
        if (cancelled) return;
        setLeaving(true);
        // Matches the fade in splash.css; the overlay has to outlive the
        // transition or the content flashes through it.
        window.setTimeout(() => {
          if (!cancelled) onDone();
        }, 420);
      }, wait);
    });

    const cap = window.setTimeout(() => {
      if (cancelled) return;
      setLeaving(true);
      window.setTimeout(() => {
        if (!cancelled) onDone();
      }, 420);
    }, MAX_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, [onDone]);

  return (
    <div className={'splash' + (leaving ? ' splash--leaving' : '')} role="presentation">
      <div className="splash__mark">
        <img src="/flyme-mark.jpg" alt="" />
      </div>
      <div className="splash__name">Flyme Music</div>
    </div>
  );
}
