import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { playerController } from '@/player';
import { fetchLyricLines, type MiniLyricLine } from '@/utils/currentLyric';
import { analyseLyricVoices, voiceSide } from '@/utils/lyricVoices';
import type { MusicTrack } from '@/music/source/types';
import { LYRIC_OFFSET_STEP, useLyricStore } from '@/store/useLyricStore';
import { Spring } from '@/utils/spring';
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
  /** Whether the fetch has settled - an empty list means "none", not "wait". */
  const [loaded, setLoaded] = useState(false);
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
      if (alive) {
        setLines(result);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
    // Narrowed to the track identity on purpose: `track` is a new object on
    // every player-store update, so depending on it would refetch lyrics on
    // each position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [track.id, track.source]);

  // Duet voices and backing vocals, read from the sheet's own conventions.
  const voices = useMemo(() => analyseLyricVoices(lines.map((line) => line.text)), [lines]);

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time + offset > currentTime) break;
    // A line that is only an aside never becomes "the line being sung"; the
    // highlight stays on the last line that actually had words.
    if (!voices.lines[i].allBackground) activeIndex = i;
  }

  /*
   * The scroll is spring-driven, which is what lets every line move.
   *
   * It used to call scrollTo, and the comment that was here explained the
   * workaround: two overlapping smooth scrolls fight, the second cancels the
   * first and restarts from wherever it got to, and that stutter is why a
   * one-line step was jumped instantly instead of animated. The result was that
   * the common case - a line changing - had no motion at all, and only a seek
   * did.
   *
   * A spring does not fight itself. Retargeting mid-flight keeps the velocity
   * and bends toward the new position, so a line arriving before the last one
   * has settled is smooth rather than a restart.
   *
   * scrollTop is still what moves, so native touch scrolling and the existing
   * drag-to-scrub keep working; the spring only drives it while the user is not
   * holding it.
   */
  const scrollSpring = useRef<Spring | null>(null);
  const scrollRaf = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>('[data-active="true"]');
    if (!el) return;

    const target = el.offsetTop - (container.clientHeight - el.offsetHeight) / 2;
    if (!scrollSpring.current) {
      /*
       * damping = sqrt(stiffness) * 2.2, which is AMLL's formula and the reason
       * it uses one.
       *
       * Critical damping for stiffness 170 is 2*sqrt(170) = 26.1, so a round 26
       * is just under it - the spring arrives, overshoots, and comes back. On a
       * scroll that reads as the text bobbing up and down after every line
       * change, which is what it did. The multiplier puts it clearly past
       * critical: no overshoot, and still fast enough to land before the next
       * line.
       */
      const stiffness = 220;
      scrollSpring.current = new Spring(container.scrollTop, {
        stiffness,
        damping: Math.sqrt(stiffness) * 2.2,
      });
    }
    scrollSpring.current.setTarget(target);

    cancelAnimationFrame(scrollRaf.current);
    let last = performance.now();
    // Seeded from the container, not the spring: the two can differ after a
    // drag, and a stale seed would make the first frame write a large jump.
    let lastWritten = container.scrollTop;
    const tick = (now: number) => {
      const spring = scrollSpring.current;
      if (!spring) return;
      spring.update((now - last) / 1000);
      last = now;
      /*
       * Written only when it actually changed, and never while a finger is on
       * it.
       *
       * scrollTop is a layout-affecting property, so every write costs a
       * layout even when the value is identical - and the spring spends most of
       * its time within a fraction of a pixel of where it already was. The
       * finger check is separate: while the user is scrolling, their gesture is
       * the authority and writing underneath them fights it.
       */
      const next = spring.position;
      if (!touching.current && Math.abs(next - lastWritten) >= 0.5) {
        container.scrollTop = next;
        lastWritten = next;
      }
      // Stop once it has arrived. A settled spring is frozen, so a loop left
      // running would burn a frame callback per frame for nothing.
      if (spring.settled) return;
      scrollRaf.current = requestAnimationFrame(tick);
    };
    scrollRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(scrollRaf.current);
  }, [activeIndex, track.id]);

  useEffect(() => () => cancelAnimationFrame(scrollRaf.current), []);

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

  const renderBody = () => {
    /*
     * "Still loading" and "there are none" are different, and used to look the
     * same. A track with no lyrics - an instrumental, or one the providers do
     * not have - resolved to an empty list, and the view sat on "loading"
     * forever, which reads as a bug rather than as an answer.
     */
    if (!lines.length) {
      return (
        <div className="lyrics__line">
          {loaded ? '这首歌暂时没有歌词' : '歌词加载中…'}
        </div>
      );
    }
    return lines.map((line, i) => {
      const parsed = voices.lines[i];
      const dist = Math.abs(i - activeIndex);
      const side = voices.duet ? voiceSide(parsed.voice) : 'center';
      const cls =
        'lyrics__line' +
        (i === activeIndex
          ? ' lyrics__line--active'
          : dist === 1
            ? ' lyrics__line--near'
            : dist >= 4
              ? ' lyrics__line--far'
              : '') +
        (voices.duet ? ' lyrics__line--' + side : '') +
        (parsed.allBackground ? ' lyrics__line--aside' : '');
      return (
        <button
          key={track.id + '-' + i}
          data-active={i === activeIndex}
          className={cls}
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
          <span className="lyrics__text">
            {parsed.runs.length
              ? parsed.runs.map((run, r) => (
                  <span
                    key={r}
                    className={run.background ? 'lyrics__bg' : undefined}
                  >
                    {run.text}
                  </span>
                ))
              : '· · ·'}
          </span>
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
        // Realign: the spring still holds the position from before the drag,
        // and without this the next update would snap the view back to it.
        if (scrollSpring.current && containerRef.current) {
          scrollSpring.current.reset(containerRef.current.scrollTop);
        }
        scheduleHide();
      }}
      onPointerCancel={(e) => {
        if (e.pointerType !== 'touch') return;
        touching.current = false;
        // Realign: the spring still holds the position from before the drag,
        // and without this the next update would snap the view back to it.
        if (scrollSpring.current && containerRef.current) {
          scrollSpring.current.reset(containerRef.current.scrollTop);
        }
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
