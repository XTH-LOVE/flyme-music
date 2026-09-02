import { useEffect, useState } from 'react';
import { initialImgStage, markDirectFailed } from './imgFallback';
import { proxiedImageSrc } from './imageSource';

export type ImageStage = 'direct' | 'proxy' | 'failed';

/**
 * Resilience chain for remote artwork: direct CDN first, proxied (blob in
 * the packaged app, /api/img in dev) second, gradient placeholder last.
 */
export function useProxiedImage(url: string | null | undefined) {
  const [stage, setStage] = useState<ImageStage>(() => initialImgStage(url) as ImageStage);
  const [proxySrc, setProxySrc] = useState<string | null>(null);

  useEffect(() => {
    setStage(initialImgStage(url) as ImageStage);
    setProxySrc(null);
  }, [url]);

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

  const src = stage === 'direct' ? url ?? null : stage === 'proxy' ? proxySrc : null;
  return { src, stage, onError };
}