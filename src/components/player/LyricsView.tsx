import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { fetchLyricLines, type MiniLyricLine } from '@/utils/currentLyric';
import type { MusicTrack } from '@/music/source/types';
import { LYRIC_OFFSET_STEP, useLyricStore } from '@/store/useLyricStore';
import './fullplayer.css';
import './lyrics-trans.css';

interface LyricsViewProps {
  track: MusicTrack;
  currentTime: number;
}

/**
 * Immersive bilingual lyrics with Halcyon-style 3D perspective tilt.
 * Uses the app-wide shared lyric cache (prefetched at play start).
 * Desktop: single click seeks. Touch: double-tap seeks; dragging shows a
 * dashed scrub line with a play button that seeks to the centered line.
 */
export function LyricsView({ track, currentTime }: LyricsViewProps) {
  const [lines, setLines] = useState<MiniLyricLine[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const touching = useRef(false);
  const hideTimer = useRef<number | null>(null);
  // Subscribed (not read via getState) so nudging the offset re-renders and the
  // highlight moves immediately, without refetching the lyrics.
  const offset = useLyricStore((s) => s.offset);
  const setOffset = useLyricStore((s) => s.setOffset);
  const nudgeOffset = useLyricStore((s) => s.nudge);
  const [offsetOpen, setOffsetOpen] = useState(false);
  // Only used to start/stop the per-frame wipe loop, so the store subscription
  // costs nothing while playing (status changes are rare).
  const playing = usePlayerStore((s) => s.status === 'playing');
  // Single-click seek only where a real mouse exists; on touch screens a
  // single tap must not seek (too easy to trigger while scrolling).
  const seekable =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Lyric font scaling (persisted) and translation visibility toggle.
  const [, setLyricScale] = useState(1);
  const [showTrans, setShowTrans] = useState(true);
  useEffect(() => {
    const s = Number(localStorage.getItem('aurora.lyricScale'));
    if (s >= 0.8 && s <= 1.6) {
      setLyricScale(s);
      document.documentElement.style.setProperty('--lyric-scale', String(s));
    }
    if (localStorage.getItem('aurora.lyricTrans') === '0') setShowTrans(false);
  }, []);
  const bumpScale = (d: number) => {
    setLyricScale((prev) => {
      const next = Math.min(1.6, Math.max(0.8, Math.round((prev + d) * 100) / 100));
      localStorage.setItem('aurora.lyricScale', String(next));
      document.documentElement.style.setProperty('--lyric-scale', String(next));
      return next;
    });
  };
  const toggleTrans = () => {
    setShowTrans((prev) => {
      localStorage.setItem('aurora.lyricTrans', prev ? '0' : '1');
      return !prev;
    });
  };

  useEffect(() => {
    let alive = true;
    // Keep the previous track's lines visible until new lyrics arrive (no flash).
    void fetchLyricLines(track).then((result) => {
      if (alive) setLines(result);
    });
    return () => {
      alive = false;
    };
    // Narrowed to the track identity on purpose: `track` is a new object on
    // every player-store update, so depending on it would refetch lyrics on
    // each position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [track.id, track.source]);

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time + offset <= currentTime) activeIndex = i;
    else break;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, track.id]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  /** Line index nearest the vertical center of the lyrics viewport. */
  const centerLineIndex = (): number | null => {
    const el = containerRef.current;
    if (!el || !lines.length) return null;
    const r = el.getBoundingClientRect();
    const center = r.top + r.height / 2;
    const nodes = el.querySelectorAll<HTMLElement>('.lyrics__line');
    let best = -1;
    let bestD = Infinity;
    nodes.forEach((n, i) => {
      const nr = n.getBoundingClientRect();
      const d = Math.abs(nr.top + nr.height / 2 - center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? best : null;
  };

  const showScrub = () => {
    setScrubIdx(centerLineIndex());
  };
  const scheduleHide = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!touching.current) setScrubIdx(null);
    }, 1600);
  };

/**
 * Rough duration a lyric line is sung for, in seconds.
 *
 * Estimated from the text because the sheet has no per-word timing: roughly 5
 * CJK characters or 2.5 Latin words a second are ordinary singing rates. Only
 * used to pace the fill, so being approximate is fine - it just has to feel
 * like it keeps up with the voice.
 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g;

/**
 * Coefficients fitted from real lyrics rather than guessed: 139 (chars, gap)
 * pairs taken from NetEase LRCs give `gap = 0.404 * chars` - about 2.5 CJK
 * characters per second. An earlier hand-picked 0.2s per character (5/s) was
 * twice as fast as real singing and the fill visibly outran the voice.
 *
 * Deliberately a little under the fitted slope: the gap also contains the pause
 * between lines, and filling across that pause is what looked wrong in the first
 * place. Landing at roughly 85-90% of the gap keeps the fill with the voice and
 * still leaves it finished before the next line arrives.
 */
const SECONDS_PER_CJK = 0.32;
/*
 * Derived, not measured: no usable English sample set came back from the lyric
 * API, so this is carried over from the measured CJK rate instead. A CJK
 * character is about one syllable (~0.4s from the fit) and an English word
 * averages roughly 1.4 syllables, giving ~0.56s per word. Treat it as a
 * reasonable carry-over rather than a fitted number.
 */
const SECONDS_PER_WORD = 0.55;
const SECONDS_BASE = 0.3;

function sungSeconds(text: string): number {
  const cjk = (text.match(CJK) ?? []).length;
  const words = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length;
  const seconds = cjk * SECONDS_PER_CJK + words * SECONDS_PER_WORD + SECONDS_BASE;
  return Math.min(7, Math.max(1.2, seconds));
}

/**
 * How far through the current line we are at `time`, 0..1. Timestamps are
 * line-level, so the gap to the next line is the only span we can fill across.
 */
  const wipeAt = (index: number, time: number): number => {
    if (index < 0 || index >= lines.length) return 1;
    const start = lines[index].time + offset;
    const next = lines[index + 1];
    // Fill across how long the line is actually sung, not across the gap to the
    // next timestamp. Sheets usually leave a pause between lines, so filling to
    // the next line kept creeping through the silence and landed after the
    // voice had already moved on. The gap stays as an upper bound so the fill
    // never runs past the next line.
    const gap = next ? next.time + offset - start : Infinity;
    const span = Math.min(gap, sungSeconds(lines[index].text));
    // Broken ordering, or a gap so long the fill would crawl: show it lit.
    if (span <= 0 || span > 30) return 1;
    return Math.min(1, Math.max(0, (time - start) / span));
  };

  /**
   * The wipe is painted per frame, not per React render.
   *
   * The player's currentTime only reaches React on the audio element's
   * `timeupdate` event, which browsers fire about four times a second - driving
   * the fill from that state made it visibly step. Instead the active line's
   * --wipe is written straight to the DOM from a rAF loop, which reads a
   * continuously advancing currentTime and costs no re-renders.
   */
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || activeIndex < 0) return;
    // Paint once immediately so a paused (or not-yet-started) line is still
    // positioned correctly.
    el.style.setProperty('--wipe', (wipeAt(activeIndex, currentTime) * 100).toFixed(1) + '%');
    if (!playing || scrubIdx !== null) return;
    // Reduced-motion users get a solid active line (see halcyon.css); skip the
    // per-frame loop entirely rather than repainting a value nobody sees.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let raf = 0;
    const tick = () => {
      el.style.setProperty('--wipe', (wipeAt(activeIndex, playerController.currentTime) * 100).toFixed(1) + '%');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wipeAt is stable per (lines, offset)
  }, [activeIndex, playing, scrubIdx, lines, offset]);

  const renderBody = () => {
    if (!lines.length) return <div className="lyrics__line">歌词加载中…</div>;
    return lines.map((line, i) => {
      const dist = Math.abs(i - activeIndex);
      const signed = Math.max(-6, Math.min(6, i - activeIndex));
      const cls =
        'lyrics__line' +
        (i === activeIndex
          ? ' lyrics__line--active'
          : dist === 1
            ? ' lyrics__line--near'
            : dist >= 4
              ? ' lyrics__line--far'
              : '');
      return (
        <button
          key={track.id + '-' + i}
          data-active={i === activeIndex}
          className={cls}
          style={
            i === activeIndex
              ? undefined
              : { transform: 'rotateX(' + signed * -2.4 + 'deg)' }
          }
          onClick={
            seekable
              ? (e) => {
                  e.stopPropagation();
                  playerController.seek(line.time + offset);
                }
              : (e) => {
                  // Touch: require a deliberate double-tap to seek.
                  if (e.detail < 2) return;
                  e.stopPropagation();
                  playerController.seek(line.time + offset);
                }
          }
        >
          <span className="lyrics__text">{line.text || '· · ·'}</span>
          {showTrans && line.trans ? <span className="lyrics__trans">{line.trans}</span> : null}
        </button>
      );
    });
  };

  return (
    <div
      className={'lyrics-wrap' + (scrubIdx !== null ? ' lyrics-wrap--scrubbing' : '')}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        touching.current = true;
        showScrub();
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch' || !touching.current) return;
        showScrub();
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'touch') return;
        touching.current = false;
        scheduleHide();
      }}
      onPointerCancel={(e) => {
        if (e.pointerType !== 'touch') return;
        touching.current = false;
        scheduleHide();
      }}
    >
      <div className="lyrics" ref={containerRef} onScroll={() => { if (scrubIdx !== null) showScrub(); }}>
        <div className="lyrics__spacer" />
        {renderBody()}
        <div className="lyrics__spacer" />
      </div>
      <div className="lyrics__controls">
        <button
          className="lyrics__ctl-btn"
          aria-label="减小歌词字号"
          onClick={(e) => { e.stopPropagation(); bumpScale(-0.1); }}
        >
          A−
        </button>
        <button
          className="lyrics__ctl-btn"
          aria-label="增大歌词字号"
          onClick={(e) => { e.stopPropagation(); bumpScale(0.1); }}
        >
          A+
        </button>
        <button
          className={'lyrics__ctl-btn' + (showTrans ? ' lyrics__ctl-btn--on' : '')}
          aria-label="显示或隐藏翻译"
          onClick={(e) => { e.stopPropagation(); toggleTrans(); }}
        >
          译
        </button>
        <button
          className={'lyrics__ctl-btn' + (offset !== 0 ? ' lyrics__ctl-btn--on' : '')}
          aria-label="歌词时间偏移调整"
          aria-pressed={offsetOpen}
          onClick={(e) => { e.stopPropagation(); setOffsetOpen((v) => !v); }}
        >
          偏移
        </button>
      </div>

      {offsetOpen ? (
        <div className="lyrics__offset" onClick={(e) => e.stopPropagation()}>
          <div className="lyrics__offset-row">
            <button className="lyrics__ctl-btn" aria-label="歌词提前" onClick={() => nudgeOffset(-1)}>
              −{LYRIC_OFFSET_STEP}s
            </button>
            <span className="lyrics__offset-val">{(offset > 0 ? '+' : '') + offset.toFixed(1)}s</span>
            <button className="lyrics__ctl-btn" aria-label="歌词延后" onClick={() => nudgeOffset(1)}>
              +{LYRIC_OFFSET_STEP}s
            </button>
            <button className="lyrics__ctl-btn" onClick={() => setOffset(0)}>
              重置
            </button>
          </div>
          <div className="lyrics__offset-hint">歌词比声音早，就按 +</div>
        </div>
      ) : null}
      {scrubIdx !== null && lines[scrubIdx] ? (
        <div className="lyrics__scrub">
          <span className="lyrics__scrub-line" />
          <button
            className="lyrics__scrub-btn"
            aria-label="跳转到这句"
            onClick={(e) => {
              e.stopPropagation();
              playerController.seek(lines[scrubIdx].time + offset);
              setScrubIdx(null);
            }}
          >
            <Icon name="play" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
