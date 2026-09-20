import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { resolveTrackPic } from '@/music/source/track-resolver';
import { withPicSize } from '@/utils/imgFallback';
import { fallbackPalette } from '@/utils/palette';
import { useCoverPalette } from '@/utils/coverPalette';
import { useProxiedImage } from '@/utils/useProxiedImage';
import type { MusicTrack } from '@/music/source/types';
import './source.css';

interface TrackCoverProps {
  track: MusicTrack;
  radius?: string;
  bare?: boolean;
  title?: string;
  /** When true the image loads eagerly with high fetch priority (current track). */
  priority?: boolean;
}

/**
 * Cover for any track: gradient base always renders (instant, no flash),
 * real artwork layers on top once loaded - falling back through the proxy
 * (blob URL in the packaged app, /api/img in dev) when the CDN blocks
 * direct hotlinks.
 */
export function TrackCover({ track, radius, bare = false, title, priority = false }: TrackCoverProps) {
  const size = priority ? '500y500' : '300y300';
  const [url, setUrl] = useState<string | null>(withPicSize(track.picUrl, size) || null);
  const { src: imgSrc, stage, onError, onLoad, imgRef } = useProxiedImage(url);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setUrl(withPicSize(track.picUrl, size) || null);
    setLoaded(false);
    if (!track.picUrl && track.source !== 'mock') {
      let alive = true;
      resolveTrackPic(track).then((u) => {
        if (alive && u) setUrl(withPicSize(u, size));
      });
      return () => {
        alive = false;
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.source, track.picUrl]);

  // Real-artwork palettes only for the covers users stare at (player views).
  // FullPlayer and MonetAccent already extract the current track's palette
  // through the same URL-keyed cache, so priority covers reuse that work;
  // list rows skip the extra image fetch entirely and lean on the hash
  // gradient until the artwork itself paints over it.
  const extracted = useCoverPalette(priority ? track.picUrl : undefined, track.id);
  const palette = extracted ?? track.palette ?? fallbackPalette(track.id);
  const showImg = Boolean(imgSrc) && stage !== 'failed';

  const style: React.CSSProperties = {
    background:
      'radial-gradient(120% 90% at 15% 10%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 46%),' +
      'radial-gradient(140% 120% at 90% 95%, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 55%),' +
      'linear-gradient(135deg, ' + palette[0] + ' 0%, ' + palette[1] + ' 100%)',
  };
  // Artwork loaded: drop the palette backdrop so the rounded corners stop
  // leaking placeholder color (matches the album page rendering).
  if (showImg && loaded) style.background = 'transparent';
  if (radius) style.borderRadius = radius;

  return (
    <div className="am-cover" style={style} aria-label={title ?? track.name}>
      {showImg && imgSrc ? (
        <img
          key={stage + imgSrc}
          ref={imgRef}
          className="track-cover-img"
          src={imgSrc}
          alt={title ?? track.name}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          // same-origin, not no-referrer. The proxy fallback is a same-origin
          // request, and /api/img only serves requests that carry origin
          // evidence; with no-referrer the browser sent none, so every proxied
          // cover came back 403. Cross-origin CDN loads still send no referrer,
          // which is the privacy intent this was protecting.
          referrerPolicy="same-origin"
          onError={onError}
          onLoad={() => {
            setLoaded(true);
            onLoad();
          }}
        />
      ) : null}
      {!showImg && !bare && title ? <span className="am-cover__glyph">{title.slice(0, 1)}</span> : null}
      {!showImg && !bare && !title ? <Icon name="music" size={22} className="am-cover__icon" /> : null}
    </div>
  );
}