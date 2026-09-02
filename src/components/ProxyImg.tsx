import { useState } from 'react';
import { initialImgStage, markDirectFailed } from '@/utils/imgFallback';

interface ProxyImgProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * <img> with a resilience chain: direct CDN load first; on failure retry
 * through the dev-server image proxy (bypasses hotlink/referrer blocks);
 * if that also fails the element disappears so the underlying gradient
 * fallback stays visible.
 */
export function ProxyImg({ src, alt = '', className, style }: ProxyImgProps) {
  const [stage, setStage] = useState<'direct' | 'proxy'>(initialImgStage(src));
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      key={stage + src}
      className={className}
      style={style}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={stage === 'direct' ? src : '/api/img?url=' + encodeURIComponent(src)}
      onError={() => {
        if (stage === 'direct') {
          markDirectFailed(src);
          setStage('proxy');
        } else setFailed(true);
      }}
    />
  );
}
