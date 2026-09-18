import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { playerController } from '@/player';
import { fetchLyricLines, type MiniLyricLine } from '@/utils/currentLyric';
import type { MusicTrack } from '@/music/source/types';
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
    if (lines[i].time <= currentTime) activeIndex = i;
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
                  playerController.seek(line.time);
                }
              : (e) => {
                  // Touch: require a deliberate double-tap to seek.
                  if (e.detail < 2) return;
                  e.stopPropagation();
                  playerController.seek(line.time);
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
      </div>
      {scrubIdx !== null && lines[scrubIdx] ? (
        <div className="lyrics__scrub">
          <span className="lyrics__scrub-line" />
          <button
            className="lyrics__scrub-btn"
            aria-label="跳转到这句"
            onClick={(e) => {
              e.stopPropagation();
              playerController.seek(lines[scrubIdx].time);
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
