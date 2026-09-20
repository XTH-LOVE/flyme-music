import { Icon } from '@/components/Icon';
import './ds.css';

interface CoverProps {
  palette: [string, string];
  title?: string;
  radius?: string;
  /** Hide the glyph for very small sizes. */
  bare?: boolean;
}

/**
 * Local cover renderer: layered gradients instead of network images,
 * so the app runs fully offline with zero copyright risk.
 *
 * The three background layers are the whole design and each one earns its
 * place: a specular highlight top-left, a vignette bottom-right, and the
 * palette underneath. Removing any of them flattens the cover into a plain
 * swatch.
 *
 * A procedural vinyl placeholder was tried here and reverted. It does not fit
 * this component's role: `Cover` is not a *fallback for missing artwork*, it is
 * *the* renderer for every local album, playlist and card, so a record disc
 * replaced the design rather than filling a gap - and a large pale disc under
 * the glyph read as a smudge at card sizes. Halcyon's `DefaultAlbumCover` works
 * there because it only appears when a file has no embedded art.
 *
 * If a vinyl treatment is wanted later, it has to be an overlay that keeps
 * these gradients and adds grooves, not a replacement for them - and it needs
 * to be looked at at 96px, 160px and 240px before it ships.
 */
export function Cover({ palette, title, radius, bare = false }: CoverProps) {
  const style: React.CSSProperties = {
    background:
      'radial-gradient(120% 90% at 15% 10%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 46%),' +
      'radial-gradient(140% 120% at 90% 95%, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 55%),' +
      'linear-gradient(135deg, ' + palette[0] + ' 0%, ' + palette[1] + ' 100%)',
  };
  if (radius) style.borderRadius = radius;
  return (
    <div className="am-cover" style={style} aria-label={title}>
      {!bare && title ? <span className="am-cover__glyph">{title.slice(0, 1)}</span> : null}
      {!bare && !title ? <Icon name="music" size={22} className="am-cover__icon" /> : null}
    </div>
  );
}
