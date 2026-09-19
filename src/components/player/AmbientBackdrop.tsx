import { useEffect, useState } from 'react';
import type { MusicTrack } from '@/music/source/types';
import { fallbackPalette } from '@/utils/palette';
import { darken } from '@/utils/color';
import { withPicSize } from '@/utils/imgFallback';
import { useProxiedImage } from '@/utils/useProxiedImage';

interface BgLayer {
  key: string;
  track: MusicTrack;
}

/** Blurred cover image with direct -> proxy fallback. */
function BgImage({ track }: { track: MusicTrack }) {
  const url = withPicSize(track.picUrl, '768y768');
  const { src, stage, onError } = useProxiedImage(url);
  if (!src || stage === 'failed') return null;
  return (
    <img
      key={stage + src}
      className="fp-bg__img"
      src={src}
      alt=""
      referrerPolicy="same-origin"
      onError={onError}
    />
  );
}

/**
 * Full-screen ambient backdrop generated from the album artwork:
 * gradient base + heavily blurred cover + scrim + film noise.
 * Keeps the last two layers mounted so song changes crossfade smoothly.
 */
export function AmbientBackdrop({ track }: { track: MusicTrack }) {
  const [layers, setLayers] = useState<BgLayer[]>([{ key: track.id, track }]);

  useEffect(() => {
    setLayers((prev) => {
      if (prev.length && prev[prev.length - 1].key === track.id) return prev;
      return [...prev, { key: track.id, track }].slice(-2);
    });
  }, [track.id, track]);

  return (
    <div className="fp-bg" aria-hidden="true">
      {layers.map((l, i) => {
        const palette = l.track.palette ?? fallbackPalette(l.track.id);
        const isTop = i === layers.length - 1;
        return (
          <div
            key={l.key}
            className={'fp-bg__layer' + (isTop ? ' fp-bg__layer--top' : '')}
            style={{
              background:
                'linear-gradient(165deg, ' +
                darken(palette[0], 0.45) +
                ' 0%, ' +
                darken(palette[1], 0.68) +
                ' 100%)',
            }}
          >
            <BgImage track={l.track} />
          </div>
        );
      })}
      <div className="fp-bg__scrim" />
      <div className="fp-bg__noise" />
    </div>
  );
}