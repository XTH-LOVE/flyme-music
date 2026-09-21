import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { Slider } from '@/design-system/components/Slider';
import { TrackCover } from '@/components/TrackCover';
import { CommentsSheet } from '@/components/CommentsSheet';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useExtrasStore } from '@/store/useExtrasStore';
import { useLyricStore } from '@/store/useLyricStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useCrossfadeStack } from '@/hooks/useCrossfadeStack';
import { downloadTrack } from '@/utils/download';
import { notify } from '@/utils/notify';
import { formatTime } from '@/utils/format';
import { fallbackPalette } from '@/utils/palette';
import { useCoverPalette } from '@/utils/coverPalette';
import { shareLyricCard } from '@/utils/lyricShare';
import { fetchLyricLines, lyricLineAt, type MiniLyricLine } from '@/utils/currentLyric';
import { plainLyricLines } from '@/utils/lyricVoices';
import type { MusicTrack } from '@/music/source/types';
import { LyricsView } from './LyricsView';
import { QueueSheet } from './QueueSheet';
import { Visualizer } from './Visualizer';
import { AmbientCanvas } from './AmbientCanvas';
import { pipSupported, openPiPLyrics, closePiPLyrics, isPipOpen } from './PiPLyrics';
import {
  EQ_PRESETS,
  EQ_RANGE_DB,
  getEqGains,
  getEqPreset,
  isWired,
  setEqGains,
  setEqPreset,
  type EqGains,
} from '@/player/webAudio';
import { flingVelocity, trimSamples, type DragSample } from '@/player/dismissGesture';
import { glowFillWidth, glowHeadOpacity } from '@/utils/glowProgress';
import { deviceTier } from '@/utils/deviceTier';
import './fullplayer.css';
import './halcyon.css';
import './QueueEnhance.css';
import './immersive.css';

const SOURCE_LABEL: Record<string, string> = {
  netease: '网易云',
  qq: 'QQ音乐',
  joox: 'JOOX',
  mock: '本地',
};
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const TIMER_MINUTES = [15, 30, 45, 60];

function bgGrad(palette: [string, string]): string {
  const a = palette[0];
  const b = palette[1] ?? palette[0];
  return (
    'linear-gradient(180deg, ' +
    'color-mix(in srgb, ' + b + ' 66%, #0a0a12) 0%, ' +
    'color-mix(in srgb, ' + a + ' 52%, #0a0a12) 48%, ' +
    'color-mix(in srgb, ' + a + ' 26%, #050508) 100%)'
  );
}

/** One background layer: blurred artwork ambience + palette gradient. */
function HcBgLayer({ t, top }: { t: MusicTrack; top: boolean }) {
  const extracted = useCoverPalette(t.picUrl, t.id);
  const palette = extracted ?? t.palette ?? fallbackPalette(t.id);
  return (
    <div className={'hc-bg__layer' + (top ? ' hc-bg__layer--top' : '')}>
      {t.picUrl ? (
        <div
          className="hc-bg__cover"
          style={{ backgroundImage: 'url("' + t.picUrl + '")' }}
          aria-hidden="true"
        />
      ) : null}
      <div className="hc-bg__grad" style={{ background: bgGrad(palette) }} />
    </div>
  );
}

/** Lyrics for the current track, shared by the immersive and mobile strips. */
function useLyricLines(track: MusicTrack): MiniLyricLine[] {
  const [lines, setLines] = useState<MiniLyricLine[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchLyricLines(track).then((l) => {
      if (alive) setLines(l);
    });
    return () => {
      alive = false;
    };
    // Narrowed to the track identity on purpose: `track` is a new object on
    // every player-store update, so depending on it would refetch lyrics on
    // each position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [track.id, track.source]);

  return lines;
}

/**
 * Same lines, with voice tags and backing vocals stripped.
 *
 * The one-line strips have no room for a duet layout or a dimmer aside, so they
 * get the plain text instead - a strip showing "男：…" or "（和声）" is just
 * noise in a 20px band.
 */
function useSungLines(track: MusicTrack): MiniLyricLine[] {
  const lines = useLyricLines(track);
  return useMemo(() => plainLyricLines(lines), [lines]);
}

/** Halcyon background: two stacked gradient layers crossfade on track change. */
function HalcyonBg({ track, live }: { track: MusicTrack; live: boolean }) {
  const stack = useCrossfadeStack(track);
  const extracted = useCoverPalette(track.picUrl, track.id);
  const palette = extracted ?? track.palette ?? fallbackPalette(track.id);

  return (
    <div className="hc-bg">
      {stack.map((t, i) => (
        <HcBgLayer key={t.source + ':' + t.id} t={t} top={i === stack.length - 1} />
      ))}
      {/* The colour field sits above the artwork layers so its palette wash is
          actually visible, and below the flow scrim so text contrast holds. */}
      <AmbientCanvas palette={palette} live={live} />
      {/* The ambient drift only runs while playing - a moving background behind
          a paused player looks like a bug, not a flourish. */}
      <div className={'hc-bg__flow' + (live ? ' hc-bg__flow--live' : '')} />
      <div className="hc-bg__noise" />
    </div>
  );
}

/** Full-bleed immersive cover: artwork fills the whole player, crossfading. */
function ImmersiveCover({ track }: { track: MusicTrack }) {
  const stack = useCrossfadeStack(track);

  return (
    <>
      {stack.map((t, i) => (
        <div
          key={t.source + ':' + t.id}
          className={
            'hc-imm__layer' + (i === stack.length - 1 ? ' hc-imm__layer--top' : '')
          }
        >
          <TrackCover track={t} bare priority />
        </div>
      ))}
    </>
  );
}

/** Active lyric line for the immersive mini-lyric strip. */
function ImmLyricLine({ track, currentTime }: { track: MusicTrack; currentTime: number }) {
  const lines = useSungLines(track);
  const line = lyricLineAt(lines, currentTime);
  return <div className="hc-imm__lyric">{line?.text ?? ''}</div>;
}

/**
 * Mobile cover page: the current lyric line with the next one under it.
 *
 * Two lines rather than one, because a single line is not enough to sing along
 * with - you see the words after you needed them. The second line is dimmed so
 * the pair reads as "here" and "next" rather than as two equally current lines.
 */
function MiniLyricStrip({ track, currentTime }: { track: MusicTrack; currentTime: number }) {
  const lines = useSungLines(track);
  // Same global timing correction the lyrics view applies, so the strip and the
  // full lyric sheet never disagree about which line is current.
  const offset = useLyricStore((s) => s.offset);

  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time + offset <= currentTime) active = i;
    else break;
  }
  if (!lines.length || active < 0) return null;

  /*
   * Two rows: the current line and the one after it.
   *
   * Keyed by the line's own index rather than by its position in the array, so
   * when the song advances each row is recognised as a different line and
   * remounts. That matters because the movement is a CSS animation rather than
   * a transition: an animation plays when a node appears, whereas a transition
   * needs a property to change, and here nothing does - the rows simply hold
   * different text.
   *
   * The incoming line rises into place from below, which is the direction the
   * eye is already travelling when reading a lyric.
   */
  const rows = [lines[active], lines[active + 1]];

  return (
    <div className="hc-p-minilyric">
      {rows.map((row, index) => (
        <div
          key={(row ? row.time : 'end') + '-' + index}
          className={'hc-p-minilyric__line' + (index === 0 ? '' : ' hc-p-minilyric__line--next')}
        >
          {row?.text || (index === 0 ? '· · ·' : '')}
        </div>
      ))}
    </div>
  );
}

/** Cover that crossfades between the previous and current track. */
function CoverSwap({ track }: { track: MusicTrack }) {
  const stack = useCrossfadeStack(track);

  return (
    <div className="fp-cover-swap hc-swap">
      {stack.map((t, i) => (
        <div
          key={t.source + ':' + t.id}
          className={
            'fp-cover-swap__layer' + (i === stack.length - 1 ? ' fp-cover-swap__layer--top' : '')
          }
        >
          <TrackCover track={t} title={t.album} radius="14px" priority />
        </div>
      ))}
    </div>
  );
}

/** Halcyon "Super Island" glow progress bar: capsule track + comet head. */
function GlowProgress({
  value,
  max,
  onScrub,
  onCommit,
}: {
  value: number;
  max: number;
  onScrub: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  // Weak devices get the plain dot: the blurred sprite is the only part of the
  // bar that costs anything per frame. Halcyon makes the same call, picking a
  // Canvas bar over its shader one.
  const lite = deviceTier() === 'low';

  const posFrom = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * max;
  };

  // Keyboard parity with the pointer scrub: arrows step ~5s, Home/End jump.
  const keySeek = (delta: number) => {
    const next = Math.min(max, Math.max(0, value + delta));
    onScrub(next);
    onCommit(next);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = max > 0 ? Math.max(5, max / 40) : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      keySeek(-step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      keySeek(step);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      keySeek(-step * 4);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      keySeek(step * 4);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onScrub(0);
      onCommit(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onScrub(max);
      onCommit(max);
    }
  };

  return (
    <div
      ref={ref}
      className={
        'hc-glow' + (active ? ' hc-glow--active' : '') + (lite ? ' hc-glow--lite' : '')
      }
      role="slider"
      tabIndex={0}
      aria-label="播放进度"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={formatTime(value) + ' / ' + formatTime(max)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(posFrom(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging.current) onScrub(posFrom(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        setActive(false);
        onCommit(posFrom(e.clientX));
      }}
    >
      <div className="hc-glow__track">
        {/* The fill stops at a circle once it is as wide as it is tall, which
            is the Dynamic Island degenerate case, and the comet fades in over
            the first few percent so it never hangs off the start of the bar. */}
        <div className="hc-glow__fill" style={{ width: glowFillWidth(frac) }}>
          <div
            className="hc-glow__head"
            style={{ '--hc-head-fade': String(glowHeadOpacity(frac)) } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}

/** Elements that must never trigger the drag-down dismiss gesture. */
const INTERACTIVE_SEL =
  'button, a, input, .hc-glow, .am-slider, .lyrics, .lyrics-wrap, .hc-cover, .hc-transport, .hc-volume, .am-sheet-root, .hc-more, .mini-glass';

/** Downward drag distance that dismisses, in px. */
const DISMISS_DISTANCE = 130;
/** ...or this downward speed, so a short flick closes without travelling far. */
const DISMISS_VELOCITY = 800;
/** Below this the gesture is treated as a jitter, not a flick. */
const DISMISS_VELOCITY_MIN_TRAVEL = 24;
/** Top corner radius at full dismiss progress — the "card peeling" look. */
const DISMISS_CORNER_RADIUS = 30;

/**
 * Halcyon-style player: classic split view + immersive full-bleed cover mode,
 * drag-down dismiss, sleep timer, speed, lyric share card, PiP lyrics.
 */
export function FullPlayer() {
  const open = usePlayerStore((s) => s.fullPlayerOpen);
  const current = usePlayerStore((s) => s.current);
  const status = usePlayerStore((s) => s.status);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const lyricsMode = usePlayerStore((s) => s.lyricsMode);
  const ambientMotion = useSettingsStore((s) => s.ambientMotion);
  const close = usePlayerStore((s) => s.closeFullPlayer);
  const toggleLyrics = usePlayerStore((s) => s.toggleLyricsMode);
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const speed = useExtrasStore((s) => s.speed);
  const setSpeed = useExtrasStore((s) => s.setSpeed);
  const sleepEndsAt = useExtrasStore((s) => s.sleepEndsAt);
  const stopAfterCurrent = useExtrasStore((s) => s.stopAfterCurrent);
  const setSleepMinutes = useExtrasStore((s) => s.setSleepMinutes);
  const setStopAfterCurrent = useExtrasStore((s) => s.setStopAfterCurrent);
  const clearSleep = useExtrasStore((s) => s.clearSleep);
  const immersive = useExtrasStore((s) => s.immersive);
  const toggleImmersive = useExtrasStore((s) => s.toggleImmersive);
  const [queueOpen, setQueueOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Volume + spectrum are secondary: collapsed by default so the left column
  // reads as an album rather than a control panel. `pinned` is an explicit
  // click-to-stay-open; `hovering` is a transient mouse convenience.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const secondaryOpen = pinned || hovering;
  const hoverTimer = useRef<number | null>(null);

  const openHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovering(true);
  };

  /*
   * Delayed on purpose. Collapsed, the panel is 0px tall, so moving the pointer
   * down from the toggle briefly leaves the zone before the panel has grown -
   * closing immediately would snap it shut mid-open. The delay covers the
   * expand transition; once open, the panel keeps the pointer inside.
   */
  const closeHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovering(false), 260);
  };

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    [],
  );
  const [scrub, setScrub] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pipOpen, setPipOpen] = useState(isPipOpen());
  const trackPalette = useCoverPalette(current?.picUrl, current?.id ?? '');
  const [eqPreset, setEqPresetState] = useState(() => getEqPreset());
  // Seeded from whatever is in effect, so opening the sheet shows the curve the
  // user is actually hearing rather than a row of zeroes.
  const [eqGains, setEqGainsState] = useState<EqGains>(() => getEqGains());
  const [dragX, setDragX] = useState(0);
  const [dismissY, setDismissY] = useState(0);
  const [dismissX, setDismissX] = useState(0);
  const [dismissActive, setDismissActive] = useState(false);
  const dragRef = useRef({ startX: 0, dx: 0, active: false });
  const dismissRef = useRef({
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    edge: false,
    active: false,
    /** Trailing pointer samples, trimmed to the velocity window on each move. */
    samples: [] as DragSample[],
  });
  // Reactive media query: a render-time matchMedia read would freeze the
  // layout when the window is resized or rotated while the player is closed.
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!open) {
      setQueueOpen(false);
      setMoreOpen(false);
      setDismissY(0);
      setDismissX(0);
    }
  }, [open]);

  if (!open || !current) return null;

  const fav = favorites.includes(current.id);
  const playing = status === 'playing';
  const shown = scrub ?? currentTime;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadTrack(current);
    } catch (error) {
      // 用户取消另存为不算错误
      if (error instanceof Error && error.message !== 'cancelled') notify(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareLyricCard(current, currentTime);
    } catch (error) {
      if (error instanceof Error && error.message !== 'cancelled') notify('分享失败：' + error.message);
    } finally {
      setSharing(false);
    }
  };

  const handlePip = async () => {
    if (pipOpen) {
      closePiPLyrics();
      setPipOpen(false);
      return;
    }
    const ok = await openPiPLyrics();
    setPipOpen(ok);
  };

  const sleepLabel = sleepEndsAt
    ? Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000)) + ' 分钟后暂停'
    : stopAfterCurrent
      ? '播完本曲后暂停'
      : '';

  /* ---- Halcyon cover swipe (horizontal) ---- */
  const coverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, dx: 0, active: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const coverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dx = dx;
    setDragX(Math.max(-110, Math.min(110, dx * 0.35)));
  };
  const coverPointerUp = () => {
    if (!dragRef.current.active) return;
    const dx = dragRef.current.dx;
    dragRef.current.active = false;
    setDragX(0);
    if (isDesktop) {
      if (dx <= -84) playerController.next();
      else if (dx >= 84) playerController.previous();
      return;
    }
    // On mobile, a right swipe and a tap reveal lyrics; a left swipe advances.
    if (dx <= -84) playerController.next();
    else if (dx >= 84 || Math.abs(dx) < 20) toggleLyrics();
  };

  /* ---- Halcyon drag-down dismiss (vertical) + touch edge swipe-back (horizontal) ---- */
  const dismissDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target;
    // Touches starting near either edge start the swipe-back gesture even
    // over interactive layers (lyrics, cover, buttons).
    const edgeZone =
      e.pointerType === 'touch' &&
      (e.clientX <= 36 || e.clientX >= window.innerWidth - 36);
    if (!edgeZone && t instanceof Element && t.closest(INTERACTIVE_SEL)) return;
    dismissRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      edge: edgeZone,
      active: true,
      samples: [{ t: e.timeStamp, y: e.clientY }],
    };
    setDismissActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dismissMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dismissRef.current;
    if (!d.active) return;
    d.dx = e.clientX - d.startX;
    d.dy = e.clientY - d.startY;
    if (d.edge) {
      // Horizontal intent → follow-finger swipe back; otherwise abort.
      if (d.dx > Math.abs(d.dy) + 8) {
        setDismissX(Math.min(d.dx * 0.85, 320));
      } else if (Math.abs(d.dy) > 12 || d.dx < -12) {
        d.edge = false;
        d.active = false;
        setDismissX(0);
      }
      return;
    }
    if (d.dy > 0) setDismissY(Math.min(d.dy, 420));
    // Fed every move, not just the downward ones: an up-then-down flick should
    // measure the flick, not the reversal.
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    trimSamples(d.samples, e.timeStamp);
  };
  const dismissUp = () => {
    const d = dismissRef.current;
    if (!d.active) return;
    d.active = false;
    setDismissActive(false);
    if (d.edge && d.dx >= 80) close();
    setDismissX(0);
    // A short, fast flick closes even though the distance threshold was not
    // reached - dragging 130px on a tall phone is a long way to travel.
    const flung =
      d.dy >= DISMISS_VELOCITY_MIN_TRAVEL && flingVelocity(d.samples) >= DISMISS_VELOCITY;
    if (d.dy >= DISMISS_DISTANCE || flung) close();
    setDismissY(0);
  };
  const dismissProgress = Math.min(1, dismissY / DISMISS_DISTANCE);
  const dismissStyle: React.CSSProperties | undefined =
    dismissY > 0 || dismissX > 0 || dismissActive
      ? {
          transform:
            dismissX > 0
              ? 'translateX(' + dismissX + 'px)'
              : 'translateY(' + dismissY + 'px) scale(' + Math.max(0.92, 1 - dismissY / 1800) + ')',
          opacity:
            dismissX > 0
              ? Math.max(0.3, 1 - dismissX / 900)
              : Math.max(0.25, 1 - dismissY / 650),
          // Corners grow as the panel is pulled away, so it reads as a card
          // being peeled off the stack rather than a slab sliding down.
          borderTopLeftRadius: dismissX > 0 ? undefined : DISMISS_CORNER_RADIUS * dismissProgress,
          borderTopRightRadius: dismissX > 0 ? undefined : DISMISS_CORNER_RADIUS * dismissProgress,
          transition: dismissActive
            ? 'none'
            : 'transform 280ms var(--am-ease-spring), opacity 240ms var(--am-ease-standard), border-radius 280ms var(--am-ease-spring)',
        }
      : undefined;
  const dismissProps = {
    onPointerDown: dismissDown,
    onPointerMove: dismissMove,
    onPointerUp: dismissUp,
    onPointerCancel: dismissUp,
  };

  const seekTo = (v: number) => {
    playerController.seek(v);
    setScrub(null);
  };

  const wheelVolume = (e: React.WheelEvent) => {
    playerController.setVolume(Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? 0.05 : -0.05))));
  };

  const favButton = (
    <button
      className={'hc-iconbtn' + (fav ? ' hc-iconbtn--fav' : '')}
      onClick={() => toggleFavorite(current)}
      aria-label={fav ? '取消喜欢' : '喜欢'}
    >
      <Icon name={fav ? 'heartFill' : 'heart'} size={20} />
    </button>
  );

  const transportRow = (
    <div className="hc-transport">
      <button
        className={'hc-tbtn' + (shuffle || repeat !== 'off' ? ' hc-tbtn--on' : '')}
        onClick={() => playerController.cyclePlaybackMode()}
        aria-label={shuffle ? '随机播放' : repeat === 'all' ? '列表循环' : repeat === 'one' ? '单曲循环' : '顺序播放'}
      >
        <Icon name={shuffle ? 'shuffle' : repeat === 'one' ? 'repeatOne' : 'repeat'} size={21} />
      </button>
      <button className="hc-tbtn" onClick={() => playerController.previous()} aria-label="上一首">
        <Icon name="prev" size={32} />
      </button>
      <button
        className="hc-play"
        onClick={() => playerController.toggle()}
        aria-label={playing ? '暂停' : '播放'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={playing ? 36 : 38} />
      </button>
      <button className="hc-tbtn" onClick={() => playerController.next()} aria-label="下一首">
        <Icon name="next" size={32} />
      </button>
      <button className="hc-tbtn hc-tbtn--dim" onClick={() => setQueueOpen(true)} aria-label="播放队列">
        <Icon name="queue" size={22} />
      </button>
    </div>
  );

  const progressBlock = (
    <div className="hc-progress-block">
      <GlowProgress value={shown} max={duration} onScrub={setScrub} onCommit={seekTo} />
      <div className="hc-times">
        <span>{formatTime(shown)}</span>
        <span className="hc-pill">{SOURCE_LABEL[current.source] ?? '在线'}</span>
        <span>-{formatTime(Math.max(0, duration - shown))}</span>
      </div>
    </div>
  );

  const sheets = (
    <>
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
      <BottomSheet open={moreOpen} title="更多操作" onClose={() => setMoreOpen(false)}>
        <div className="hc-more">
          <button onClick={() => toggleImmersive()}>
            <Icon name="album" size={18} />
            {immersive ? '退出沉浸封面' : '沉浸封面模式'}
          </button>
          {current.source === 'netease' ? (
            <button
              onClick={() => {
                setMoreOpen(false);
                setCommentsOpen(true);
              }}
            >
              <Icon name="lyric" size={18} />
              查看评论
            </button>
          ) : null}
          {current.source !== 'mock' ? (
            <button
              onClick={() => {
                setMoreOpen(false);
                void handleDownload();
              }}
            >
              <Icon name="download" size={18} />
              {downloading ? '下载中…' : '下载歌曲'}
            </button>
          ) : null}
          <button onClick={() => void handleShare()}>
            <Icon name="music" size={18} />
            {sharing ? '生成中…' : '分享歌词卡片'}
          </button>
          {pipSupported() && isDesktop ? (
            <button onClick={() => void handlePip()}>
              <Icon name="monitor" size={18} />
              {pipOpen ? '关闭桌面歌词' : '桌面歌词（画中画）'}
            </button>
          ) : null}

          <div className="hc-more__divider" />
          <div className="hc-more__label">播放速度{speed !== 1 ? ' · ' + speed + 'x' : ''}</div>
          <div className="hc-more__chips">
            {SPEEDS.map((v) => (
              <button
                key={v}
                className={'hc-chip' + (speed === v ? ' hc-chip--on' : '')}
                onClick={() => setSpeed(v)}
              >
                {v}x
              </button>
            ))}
          </div>

          {/* The audio URL is chosen when a track is attached, so switching the
              chain on mid-track cannot affect the track already playing. Saying
              "next track" is more useful than a bare "unsupported", which reads
              as a permanent limitation rather than a timing one. */}
          <div className="hc-more__label">
            均衡器{isWired() ? '' : ' · 下一首生效'}
          </div>
          <div className="hc-more__chips">
            {EQ_PRESETS.map((p) => (
              <button
                key={p.key}
                className={'hc-chip' + (eqPreset === p.key ? ' hc-chip--on' : '')}
                onClick={() => {
                  setEqPreset(p.key);
                  setEqPresetState(p.key);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* The sliders sit under the presets rather than in a separate panel:
              a preset is a starting point and this is where you go from it, so
              they are two halves of one control. */}
          <div className="hc-more__label">
            自定义{EQ_PRESETS.some((p) => p.key === eqPreset) && eqPreset !== 'flat' ? '（调整后覆盖预设）' : ''}
          </div>
          <div className="hc-eq">
            {(
              [
                ['low', '低音', '250Hz'],
                ['mid', '中音', '1.8kHz'],
                ['high', '高音', '4kHz'],
              ] as const
            ).map(([band, label, freq]) => (
              <label key={band} className="hc-eq__row">
                <span className="hc-eq__name">
                  {label}
                  <em>{freq}</em>
                </span>
                <input
                  className="hc-eq__slider"
                  type="range"
                  min={-EQ_RANGE_DB}
                  max={EQ_RANGE_DB}
                  step={0.5}
                  value={eqGains[band]}
                  onChange={(e) => {
                    // Applied on every input event, not on release: the point
                    // of a slider is hearing what it does as you move it.
                    const next = { ...eqGains, [band]: Number(e.target.value) };
                    setEqGainsState(next);
                    setEqGains(next);
                    setEqPresetState('custom');
                  }}
                />
                <span className="hc-eq__value">
                  {eqGains[band] > 0 ? '+' : ''}
                  {eqGains[band].toFixed(1)}
                </span>
              </label>
            ))}
            <button
              className="hc-eq__reset"
              onClick={() => {
                const flat = { low: 0, mid: 0, high: 0 };
                setEqGainsState(flat);
                setEqGains(flat);
                setEqPresetState('custom');
              }}
            >
              归零
            </button>
          </div>

          <div className="hc-more__label">定时关闭{sleepLabel ? ' · ' + sleepLabel : ''}</div>
          <div className="hc-more__chips">
            {TIMER_MINUTES.map((m) => (
              <button key={m} className="hc-chip" onClick={() => setSleepMinutes(m)}>
                {m} 分钟
              </button>
            ))}
            <button
              className={'hc-chip' + (stopAfterCurrent ? ' hc-chip--on' : '')}
              onClick={() => setStopAfterCurrent(true)}
            >
              播完本曲
            </button>
            {sleepEndsAt || stopAfterCurrent ? (
              <button className="hc-chip" onClick={() => clearSleep()}>
                取消
              </button>
            ) : null}
          </div>
        </div>
      </BottomSheet>
      <CommentsSheet
        open={commentsOpen}
        trackName={current.name}
        songId={current.id}
        onClose={() => setCommentsOpen(false)}
      />
    </>
  );

  /* ---------------- Immersive full-bleed cover mode ---------------- */
  if (immersive) {
    return (
      <div className="full-player hc hc--imm" {...dismissProps}>
        <ImmersiveCover track={current} />
        <div className="hc-imm__scrim" />
        <div className="hc-imm__content" style={dismissStyle}>
          <div className="hc-imm__top">
            <button className="hc-iconbtn" onClick={close} aria-label="收起">
              <Icon name="chevronLeft" size={22} className="hc-collapse__icon" />
            </button>
            <div className="hc-imm__top-tools">
              {favButton}
              <button
                className={'hc-iconbtn' + (moreOpen ? ' hc-iconbtn--on' : '')}
                onClick={() => setMoreOpen(true)}
                aria-label="更多"
              >
                <Icon name="more" size={20} />
              </button>
            </div>
          </div>
          <div className="hc-imm__bottom">
            <div className="hc-imm__title">{current.name}</div>
            <div className="hc-imm__artist">{current.artist.join(' / ')}</div>
            <ImmLyricLine track={current} currentTime={currentTime} />
            {progressBlock}
            {transportRow}
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  /* ---------------- Desktop: Halcyon landscape layout ---------------- */
  if (isDesktop) {
    return (
      <div className={'full-player hc' + (ambientMotion ? '' : ' hc--still')} {...dismissProps}>
        <HalcyonBg track={current} live={playing && ambientMotion} />
        <button className="hc-collapse" onClick={close} aria-label="收起">
          <Icon name="chevronLeft" size={22} className="hc-collapse__icon" />
        </button>

        <div className="hc-body" style={dismissStyle}>
          <div className="hc-left">
            <div className="hc-meta-row">
              <div className="hc-meta">
                <div className="hc-title">{current.name}</div>
                <div className="hc-artist">{current.artist.join(' / ')}</div>
              </div>
              {favButton}
              <button
                className={'hc-iconbtn' + (moreOpen ? ' hc-iconbtn--on' : '')}
                onClick={() => setMoreOpen(true)}
                aria-label="更多"
              >
                <Icon name="more" size={20} />
              </button>
            </div>

            <div className="hc-cover-wrap">
              <div
                className={
                  'hc-cover' + (playing && ambientMotion ? ' hc-cover--playing' : '')
                }
                style={{ transform: dragX ? 'translateX(' + dragX + 'px)' : undefined }}
                onPointerDown={coverPointerDown}
                onPointerMove={coverPointerMove}
                onPointerUp={coverPointerUp}
                onPointerCancel={coverPointerUp}
                title="左右拖动切换歌曲"
              >
                <CoverSwap track={current} />
              </div>
            </div>

            {progressBlock}
            {transportRow}

            {/* Hovering the zone opens the panel for mouse users, so adjusting
                volume does not require finding the toggle first. Pointer type is
                checked because touch fires pointerenter on tap too, which would
                make it open on every accidental brush. Clicking pins it open. */}
            <div
              className="hc-secondary-zone"
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') openHover();
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') closeHover();
              }}
            >
              <div className="hc-secondary-row">
              <button
                className={'hc-minibtn' + (pinned ? ' hc-minibtn--on' : '')}
                onClick={() => {
                  // Clearing hover too: otherwise un-pinning while the pointer
                  // is still inside would leave it open and the click would
                  // look like it did nothing.
                  setPinned((v) => !v);
                  if (hoverTimer.current !== null) {
                    window.clearTimeout(hoverTimer.current);
                    hoverTimer.current = null;
                  }
                  setHovering(false);
                }}
                aria-expanded={secondaryOpen}
                aria-label={secondaryOpen ? '收起音量与频谱' : '展开音量与频谱'}
              >
                <Icon name="volume" size={15} />
                {secondaryOpen ? '收起' : '音量 / 频谱'}
              </button>
            </div>

            <div
              className={'hc-secondary' + (secondaryOpen ? ' hc-secondary--open' : '')}
              aria-hidden={!secondaryOpen}
            >
              <div className="hc-secondary__inner">
                {/* Only animate while actually on screen - a collapsed panel
                    would otherwise keep driving requestAnimationFrame for a
                    canvas nobody can see. */}
                <Visualizer playing={playing && secondaryOpen} colors={trackPalette} className="hc-viz" />
                <div className="hc-volume" onWheel={wheelVolume}>
                  <Icon name="volume" size={15} />
                  <Slider
                    value={Math.round(volume * 100)}
                    max={100}
                    onChange={(v) => playerController.setVolume(v / 100)}
                  />
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="hc-right">
            <LyricsView track={current} currentTime={currentTime} />
          </div>
        </div>

        {sheets}
      </div>
    );
  }

  /* ---------------- Mobile: Halcyon portrait layout ---------------- */
  return (
    <div
      className={
        'full-player hc hc--p' +
        (lyricsMode ? ' hc--p-lyrics' : '') +
        (ambientMotion ? '' : ' hc--still')
      }
      {...dismissProps}
    >
      {/* The portrait layout used to pass `playing` alone, so the motion
          setting was silently ignored on phones. */}
      <HalcyonBg track={current} live={playing && ambientMotion} />

      <div className="hc-p-body" style={dismissStyle}>
        {lyricsMode ? (
          <>
            <div className="hc-p-head">
              <button className="hc-iconbtn" onClick={toggleLyrics} aria-label="回到封面">
                <Icon name="chevronLeft" size={22} />
              </button>
              <div
                className="hc-p-head__cover"
                onClick={toggleLyrics}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') toggleLyrics();
                }}
                aria-label="回到封面"
              >
                <TrackCover track={current} bare radius="8px" priority />
              </div>
              <div className="hc-p-head__text">
                <div className="hc-p-head__title">{current.name}</div>
                <div className="hc-p-head__artist">{current.artist.join(' / ')}</div>
              </div>
              {favButton}
            </div>
            <div className="hc-p-lyrics">
              <LyricsView track={current} currentTime={currentTime} />
            </div>
          </>
        ) : (
          <>
            <div className="hc-p-top">
              <button className="hc-iconbtn" onClick={close} aria-label="收起">
                <Icon name="chevronLeft" size={22} className="hc-collapse__icon" />
              </button>
              <button
                className="hc-iconbtn"
                onClick={toggleLyrics}
                aria-label="查看歌词"
                aria-pressed={lyricsMode}
              >
                <Icon name="lyric" size={20} />
              </button>
            </div>
            <div className="hc-p-cover">
              <div
                className="hc-cover"
                style={{ transform: dragX ? 'translateX(' + dragX + 'px)' : undefined }}
                onPointerDown={coverPointerDown}
                onPointerMove={coverPointerMove}
                onPointerUp={coverPointerUp}
                onPointerCancel={coverPointerUp}
              >
                <CoverSwap track={current} />
              </div>
            </div>
            <MiniLyricStrip track={current} currentTime={currentTime} />
          </>
        )}

        {lyricsMode ? null : (
          <>
            <div className="hc-p-spacer" />
            <div className="hc-meta-row">
              <div className="hc-meta">
                <div className="hc-title hc-title--p">{current.name}</div>
                <div className="hc-artist">{current.artist.join(' / ')}</div>
              </div>
              {favButton}
              <button className="hc-iconbtn" onClick={() => setMoreOpen(true)} aria-label="更多">
                <Icon name="more" size={20} />
              </button>
            </div>
          </>
        )}
        {progressBlock}
        {transportRow}
      </div>

      {sheets}
    </div>
  );
}
