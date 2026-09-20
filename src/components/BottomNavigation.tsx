import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import './components.css';
import './nav-glass.css';

const items: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/library', label: '排行榜', icon: 'flame' },
  { to: '/discover', label: '发现', icon: 'compass' },
  { to: '/me', label: '我的', icon: 'user' },
];

/** Press bubble height, matching the 50px pill used by the Halcyon bar. */
const BUBBLE_HEIGHT = 50;
/** A press only counts as a hit within half a tab of its centre. */
const ACTIVE_RADIUS_RATIO = 0.5;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Bubble width scales with the tab count so a two-tab bar gets a generous pill
 * while a five-tab bar keeps the pill clear of its neighbours. Ported from the
 * Halcyon bottom bar's proportions, rescaled for this bar's narrower width.
 */
function bubbleWidthFor(tabWidth: number, count: number): number {
  if (count <= 0) return BUBBLE_HEIGHT;
  if (count <= 2) return clamp(tabWidth * 0.58, 86, 112);
  if (count === 3) return clamp(tabWidth * 0.66, 74, 104);
  return clamp(tabWidth * 0.7, 56, 84);
}

interface BarGeometry {
  /** Left edge of the padding box, in viewport coordinates. */
  left: number;
  /** Padding box width, in CSS pixels. */
  width: number;
  pad: number;
  gap: number;
  tabWidth: number;
}

const EMPTY_GEO: BarGeometry = { left: 0, width: 0, pad: 0, gap: 0, tabWidth: 0 };

/**
 * Mobile floating liquid-glass navigation pill.
 *
 * Interaction follows the HyperOS bottom bar: pressing raises a glass bubble
 * under the finger, sliding sideways walks the bubble from tab to tab (the tab
 * under it scales up), and only the release commits the navigation. The pill is
 * positioned absolutely so it never participates in the flex row.
 */
export function BottomNavigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ active: false, index: -1 });

  const [geo, setGeo] = useState<BarGeometry>(EMPTY_GEO);
  const [pressed, setPressed] = useState(-1);

  const activeIndex = items.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  );

  // Measure once and on resize; the pointer handlers read the cached geometry
  // so a move never has to force a layout.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      const gap = parseFloat(style.columnGap) || 0;
      const width = el.clientWidth;
      const inner = width - padLeft - padRight - gap * (items.length - 1);
      setGeo({
        left: rect.left + borderLeft,
        width,
        pad: padLeft,
        gap,
        tabWidth: inner > 0 ? inner / items.length : 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const indicatorIndex = pressed >= 0 ? pressed : activeIndex;
  const bubbleWidth = useMemo(() => bubbleWidthFor(geo.tabWidth, items.length), [geo.tabWidth]);

  const bubbleX = useMemo(() => {
    if (indicatorIndex < 0 || geo.width <= 0 || geo.tabWidth <= 0) return 0;
    const centre = geo.pad + geo.tabWidth * (indicatorIndex + 0.5) + geo.gap * indicatorIndex;
    return clamp(centre - bubbleWidth / 2, 0, Math.max(0, geo.width - bubbleWidth));
  }, [indicatorIndex, bubbleWidth, geo]);

  const hitIndex = (clientX: number): number => {
    const { left, pad, gap, tabWidth } = geo;
    if (tabWidth <= 0) return -1;
    const x = clientX - left;
    for (let i = 0; i < items.length; i += 1) {
      const centre = pad + tabWidth * (i + 0.5) + gap * i;
      if (Math.abs(x - centre) <= tabWidth * ACTIVE_RADIUS_RATIO) return i;
    }
    return -1;
  };

  const handleDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const index = hitIndex(e.clientX);
    dragRef.current = { active: true, index };
    setPressed(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current.active) return;
    const index = hitIndex(e.clientX);
    // Only re-render when the finger crosses into a different tab; a raw
    // pointermove stream fires far more often than the bubble needs to move.
    if (index === dragRef.current.index) return;
    dragRef.current.index = index;
    setPressed(index);
  };

  const endPress = (e: React.PointerEvent<HTMLElement>, commit: boolean) => {
    if (!dragRef.current.active) return;
    dragRef.current = { active: false, index: -1 };
    const index = commit ? hitIndex(e.clientX) : -1;
    setPressed(-1);
    // Releasing outside the bar (or cancelling) aborts instead of navigating.
    if (index >= 0) navigate(items[index].to);
  };

  return (
    <nav
      ref={navRef}
      className={'bottom-nav' + (pressed >= 0 ? ' bottom-nav--pressing' : '')}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={(e) => endPress(e, true)}
      onPointerCancel={(e) => endPress(e, false)}
    >
      <span
        aria-hidden="true"
        className={'bottom-nav__bubble' + (pressed >= 0 ? ' bottom-nav__bubble--press' : '')}
        style={{ width: bubbleWidth, transform: `translate3d(${bubbleX}px, -50%, 0)` }}
      />
      {items.map((item, index) => (
        <button
          key={item.to}
          type="button"
          className={
            'bottom-nav__item' +
            (index === activeIndex ? ' bottom-nav__item--active' : '') +
            (index === pressed ? ' bottom-nav__item--pressed' : '')
          }
          aria-current={index === activeIndex ? 'page' : undefined}
          // Pointer presses are committed on release above; this only serves
          // keyboard activation, which is the sole source of detail === 0.
          onClick={(e) => {
            if (e.detail === 0) navigate(item.to);
          }}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
