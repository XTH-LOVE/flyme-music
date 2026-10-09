import { useProxiedImage } from '@/utils/useProxiedImage';

interface ProxyImgProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}

/**
 * <img> with a resilience chain: direct CDN load first; on failure retry
 * through the proxy (blob URL in the packaged app, /api/img in dev); if
 * that also fails the element disappears so the gradient fallback shows.
 */
export function ProxyImg({ src, alt = '', className, style, priority = false }: ProxyImgProps) {
  const { src: resolved, stage, onError } = useProxiedImage(src);

  if (!src || !resolved) return null;

  return (
    <img
      key={stage + resolved}
      className={className}
      style={style}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      // See TrackCover: same-origin keeps the proxy fallback usable, since
      // /api/img requires origin evidence that no-referrer suppressed.
      referrerPolicy="same-origin"
      src={resolved}
      onError={onError}
    />
  );
}
