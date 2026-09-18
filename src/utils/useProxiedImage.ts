import { useEffect, useState } from 'react';
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
 */
const DIRECT_TIMEOUT_MS = 3500;

export function useProxiedImage(url: string | null | undefined) {
  const [stage, setStage] = useState<ImageStage>(() => initialImgStage(url) as ImageStage);
  const [proxySrc, setProxySrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStage(initialImgStage(url) as ImageStage);
    setProxySrc(null);
    setLoaded(false);
  }, [url]);

  // Give up on a stalling direct load rather than waiting for the browser's own
  // much longer connect timeout.
  useEffect(() => {
    if (stage !== 'direct' || !url || loaded) return undefined;
    const timer = window.setTimeout(() => {
      markDirectFailed(url);
      setStage('proxy');
    }, DIRECT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [stage, url, loaded]);

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
      markDirectFailed(url);
      setStage('proxy');
    } else {
      setStage('failed');
    }
  };

  const onLoad = () => setLoaded(true);

  const src = stage === 'direct' ? url ?? null : stage === 'proxy' ? proxySrc : null;
  return { src, stage, onError, onLoad };
}