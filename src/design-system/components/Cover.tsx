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
