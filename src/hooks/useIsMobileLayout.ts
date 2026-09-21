import { useEffect, useState } from 'react';

/**
 * Whether the app is currently rendering its phone layout.
 *
 * `matchMedia` rather than a resize listener so the value is correct on the
 * first render - a listener alone would show the desktop path for one frame and
 * then swap, which on a splash screen is the whole screen flashing.
 *
 * The breakpoint is the same 600px the stylesheets use. Two definitions of
 * "mobile" is how a component ends up behaving differently from the layout it
 * sits in.
 */
const QUERY = '(max-width: 599px)';

export function useIsMobileLayout(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
