import { useCallback, useEffect, useRef, useState } from 'react';
import { initialImgStage, markDirectFailed } from './imgFallback';
import { proxiedImageSrc } from './imageSource';

export type ImageStage = 'direct' | 'proxy' | 'failed';

/**
 * Resilience chain for remote artwork: direct CDN first, proxied (blob in
 * the packaged app, /api/img in dev) second, gradient placeholder last.
 */
/**
 * How long to wait for the direct CDN before giving up on it.
 *
 * A blocked or unreachable CDN usually does not error - it stalls on connect,
 * and the browser will sit on the image for tens of seconds before firing
 * `error`. By then the artwork has effectively failed to load as far as the
 * user is concerned. Bounded here, then the proxy takes over.
 *
 * Only armed once the image is actually on screen. `loading="lazy"` means an
 * offscreen image has not started fetching at all, so timing it out would fire
 * on every image below the fold - which is exactly what happened, and combined
 * with host-level failure marking it took every cover down.
 */
const DIRECT_TIMEOUT_MS = 2000;

export function useProxiedImage(url: string | null | undefined) {
  const [stage, setStage] = useState<ImageStage>(() => initialImgStage(url) as ImageStage);
  const [proxySrc, setProxySrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    setStage(initialImgStage(url) as ImageStage);
    setProxySrc(null);
    setLoaded(false);
  }, [url]);

  /**
   * Callback ref rather than useRef: the <img> is keyed on stage+src, so React
   * replaces the element when the stage changes and a plain ref would leave the
   * observer watching a detached node.
   */
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // No observer available: assume visible. The timeout is still useful, and
      // a spurious fallback costs one extra request rather than a broken cover.
      setVisible(true);
      return;
    }
    const instance = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        instance.disconnect();
      }
    });
    instance.observe(el);
    observer.current = instance;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  // Give up on a stalling direct load rather than waiting for the browser's own
  // much longer connect timeout.
  useEffect(() => {
    if (stage !== 'direct' || !url || loaded || !visible) return undefined;
    const timer = window.setTimeout(() => {
      // Only this URL is marked, not its host: a timeout says "this one was slow",
      // which on a poor connection is not evidence that the whole CDN is down.
      markDirectFailed(url, { host: false });
      setStage('proxy');
    }, DIRECT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [stage, url, loaded, visible]);

  useEffect(() => {
    if (stage !== 'proxy' || !url) return undefined;
    let alive = true;
    void proxiedImageSrc(url).then((src) => {
      if (!alive) return;
      if (src) setProxySrc(src);
      else setStage('failed');
    });
    return () => {
      alive = false;
    };
  }, [stage, url]);

  const onError = () => {
    if (stage === 'direct') {
      // A real error is unambiguous evidence the CDN refused, so the host is
      // marked as well and the rest of the page skips the failing attempt.
      markDirectFailed(url, { host: true });
      setStage('proxy');
    } else {
      setStage('failed');
    }
  };

  const onLoad = () => setLoaded(true);

  const src = stage === 'direct' ? url ?? null : stage === 'proxy' ? proxySrc : null;
  return { src, stage, onError, onLoad, imgRef };
}