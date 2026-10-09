import { Fragment, memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { playerController } from '@/player';
import { fetchLyricLines, type MiniLyricLine } from '@/utils/currentLyric';
import { parseTimedLyricFile } from '@/utils/timedLyrics';
import { optimizeLyricLines } from '@/utils/lyricOptimize';
import { analyseLyricVoices, voiceSide } from '@/utils/lyricVoices';
import type { MusicTrack } from '@/music/source/types';
import { LYRIC_OFFSET_STEP, useLyricStore } from '@/store/useLyricStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import './fullplayer.css';
import './lyrics-trans.css';

interface LyricsViewProps {
  track: MusicTrack;
  /** Optional for callers that already own the clock; normally read directly
   * from the player store so the parent player does not re-render on ticks. */
  currentTime?: number;
  onDraggingChange?: (dragging: boolean) => void;
}

const TOUCH_SLOP = 8;
const AUTO_SCROLL_RESUME_MS = 5000;
const SCROLL_ANIM_MS = 400;

interface LyricRowProps {
  line: MiniLyricLine;
  index: number;
  activeIndex: number;
  wordTime: number;
  showTrans: boolean;
  clearRows: boolean;
  duet: boolean;
  side: 'left' | 'right' | 'center';
  parsed: ReturnType<typeof analyseLyricVoices>['lines'][number];
  seekRef: { current: (time: number) => void };
  draggedRef: { current: boolean };
}

/**
 * Playback updates arrive twice a second. Keeping each row behind a memo
 * boundary prevents an update to the karaoke fill on the active row from
 * rebuilding every blurred row in the sheet. That full-list repaint is what
 * made Chromium/WebView briefly drop the text layer and look like a flash.
 */
const LyricRow = memo(function LyricRow({
  line,
  index,
  activeIndex,
  wordTime,
  showTrans,
  clearRows,
  duet,
  side,
  parsed,
  seekRef,
  draggedRef,
}: LyricRowProps) {
  const distance = Math.abs(index - activeIndex);
  const className =
    'lyrics__line' +
    (index === activeIndex
      ? ' lyrics__line--active'
      : distance === 1
        ? ' lyrics__line--near'
        : distance >= 4
          ? ' lyrics__line--far'
          : '') +
    (duet ? ' lyrics__line--' + side : '') +
    (parsed.allBackground ? ' lyrics__line--aside' : '') +
    (clearRows ? ' lyrics__line--clear' : '');

  return (
    <button
      type="button"
      data-index={index}
      data-active={index === activeIndex}
      className={className}
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        event.stopPropagation();
        seekRef.current(line.time);
      }}
    >
      <span className="lyrics__text">
        {line.words?.length && index === activeIndex && !duet && !parsed.allBackground
          ? line.words.map((word, wordIndex) => {
              const progress =
                wordTime <= word.start
                  ? 0
                  : wordTime >= word.end
                    ? 1
                    : (wordTime - word.start) / (word.end - word.start);
              return (
                <span
                  key={wordIndex}
                  className="lyrics__word"
                  style={{ '--word-progress': `${Math.round(progress * 100)}%` } as CSSProperties}
                >
                  {word.text}
                </span>
              );
            })
          : parsed.runs.length
            ? parsed.runs.map((run, runIndex) => (
                <span key={runIndex} className={run.background ? 'lyrics__bg' : undefined}>
                  {run.text}
                </span>
              ))
            : '· · ·'}
      </span>
      {showTrans && line.trans ? <span className="lyrics__trans">{line.trans}</span> : null}
    </button>
  );
});

/**
 * The lyric sheet has one owner for scrolling:
 *
 * - playback owns the sheet while the user is idle;
 * - a real touch/wheel gesture temporarily owns it;
 * - releasing the gesture keeps the sheet readable for five seconds;
 * - playback then retargets the current line with one 400ms animation.
 *
 * Keeping these states in one component is intentional. The previous version
 * combined a spring, native smooth scrolling and pointer state, which meant
 * that each system could retarget the same scroll position at once.
 */
export function LyricsView({ track, currentTime, onDraggingChange }: LyricsViewProps) {
  const storeCurrentTime = usePlayerStore((s) => s.currentTime);
  const playbackTime = currentTime ?? storeCurrentTime;
  const [lines, setLines] = useState<MiniLyricLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [request, setRequest] = useState(0);
  const [importError, setImportError] = useState('');
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [offsetOpen, setOffsetOpen] = useState(false);
  const [showTrans, setShowTrans] = useState(true);
  const [, setLyricScale] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualLyricsRef = useRef(false);
  const scrubIdxRef = useRef<number | null>(null);
  const activeIndexRef = useRef(-1);
  const userScrollingRef = useRef(false);
  const touchingRef = useRef(false);
  const dragStartedRef = useRef(false);
  const dragStartYRef = useRef(0);
  const draggedRef = useRef(false);
  const seekToLyricRef = useRef<(time: number) => void>(() => undefined);
  const autoResumeTimerRef = useRef<number | null>(null);
  const wheelReleaseTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const scrollAnimationRef = useRef<number | null>(null);
  const scrubFrameRef = useRef<number | null>(null);
  const offset = useLyricStore((s) => s.offset);
  const setOffset = useLyricStore((s) => s.setOffset);
  const nudgeOffset = useLyricStore((s) => s.nudge);

  const setScrubTarget = (index: number | null) => {
    scrubIdxRef.current = index;
    setScrubIdx(index);
  };

  const clearTimer = (timer: { current: number | null }) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const cancelScrollAnimation = () => {
    if (scrollAnimationRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  };

  const cancelScrubFrame = () => {
    if (scrubFrameRef.current !== null) {
      window.cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
  };

  useEffect(() => {
    const scale = Number(localStorage.getItem('aurora.lyricScale'));
    if (scale >= 0.8 && scale <= 1.6) {
      setLyricScale(scale);
      document.documentElement.style.setProperty('--lyric-scale', String(scale));
    }
    if (localStorage.getItem('aurora.lyricTrans') === '0') setShowTrans(false);
  }, []);

  const bumpScale = (delta: number) => {
    setLyricScale((previous) => {
      const next = Math.min(1.6, Math.max(0.8, Math.round((previous + delta) * 100) / 100));
      localStorage.setItem('aurora.lyricScale', String(next));
      document.documentElement.style.setProperty('--lyric-scale', String(next));
      return next;
    });
  };

  const toggleTrans = () => {
    setShowTrans((previous) => {
      localStorage.setItem('aurora.lyricTrans', previous ? '0' : '1');
      return !previous;
    });
  };

  useEffect(() => {
    let alive = true;
    manualLyricsRef.current = false;
    setLines([]);
    setLoaded(false);
    setLoadError('');
    setImportError('');
    void fetchLyricLines(track)
      .then((result) => {
        if (!alive || manualLyricsRef.current) return;
        setLines(result);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive || manualLyricsRef.current) return;
        setLines([]);
        setLoaded(true);
        setLoadError('歌词加载失败，请重试或导入本地歌词');
      });

    userScrollingRef.current = false;
    touchingRef.current = false;
    dragStartedRef.current = false;
    activeIndexRef.current = -1;
    clearTimer(autoResumeTimerRef);
    clearTimer(wheelReleaseTimerRef);
    clearTimer(hideTimerRef);
    cancelScrollAnimation();
    cancelScrubFrame();
    setDragging(false);
    setManualMode(false);
    setScrubTarget(null);
    onDraggingChange?.(false);

    return () => {
      alive = false;
    };
    // The track object changes on every playback tick; identity is deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.source, request]);

  useEffect(
    () => () => {
      clearTimer(autoResumeTimerRef);
      clearTimer(wheelReleaseTimerRef);
      clearTimer(hideTimerRef);
      cancelScrollAnimation();
      cancelScrubFrame();
      onDraggingChange?.(false);
    },
    [onDraggingChange],
  );

  const importLyrics = async (file?: File) => {
    if (!file) return;
    manualLyricsRef.current = true;
    try {
      const parsed = parseTimedLyricFile(await file.text());
      if (!parsed.length) throw new Error('文件中没有可识别的歌词或时间戳');
      setLines(optimizeLyricLines(parsed));
      setLoaded(true);
      setLoadError('');
      setImportError('');
    } catch (error) {
      setLoaded(true);
      setImportError(error instanceof Error ? error.message : '无法读取这个歌词文件');
    }
  };

  const voices = useMemo(() => analyseLyricVoices(lines.map((line) => line.text)), [lines]);

  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time + offset > playbackTime) break;
    if (!voices.lines[index].allBackground) activeIndex = index;
  }
  activeIndexRef.current = activeIndex;

  const lyricTarget = (index: number) => {
    const container = containerRef.current;
    if (!container || index < 0) return null;
    const line = container.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!line) return null;
    const centered = line.offsetTop - (container.clientHeight - line.offsetHeight) / 2;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    return Math.max(0, Math.min(maxScroll, centered));
  };

  const animateScrollTo = (target: number, duration = SCROLL_ANIM_MS) => {
    const container = containerRef.current;
    if (!container) return;
    cancelScrollAnimation();
    const start = container.scrollTop;
    const distance = target - start;
    if (Math.abs(distance) < 1 || duration <= 0) {
      container.scrollTop = target;
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      if (userScrollingRef.current) {
        scrollAnimationRef.current = null;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / duration);
      // Halcyon's standard PathInterpolator(0.25, 0.1, 0.25, 1).
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      container.scrollTop = start + distance * eased;
      if (progress < 1) {
        scrollAnimationRef.current = window.requestAnimationFrame(tick);
      } else {
        scrollAnimationRef.current = null;
      }
    };
    scrollAnimationRef.current = window.requestAnimationFrame(tick);
  };

  const resumeAutoScroll = () => {
    clearTimer(autoResumeTimerRef);
    userScrollingRef.current = false;
    touchingRef.current = false;
    dragStartedRef.current = false;
    setDragging(false);
    setManualMode(false);
    onDraggingChange?.(false);
    const target = lyricTarget(activeIndexRef.current);
    if (target !== null) animateScrollTo(target);
  };

  const scheduleResume = () => {
    clearTimer(autoResumeTimerRef);
    autoResumeTimerRef.current = window.setTimeout(() => {
      autoResumeTimerRef.current = null;
      resumeAutoScroll();
    }, AUTO_SCROLL_RESUME_MS);
  };

  const enterManualMode = () => {
    clearTimer(autoResumeTimerRef);
    cancelScrollAnimation();
    if (!userScrollingRef.current) {
      userScrollingRef.current = true;
      setManualMode(true);
      onDraggingChange?.(true);
    } else {
      setManualMode(true);
    }
  };

  const centerLineIndex = () => {
    const container = containerRef.current;
    if (!container || !lines.length) return null;
    const rows = container.querySelectorAll<HTMLElement>('.lyrics__line');
    if (!rows.length) return null;

    // offsetTop is monotonic in document order, so find the two rows around the
    // viewport centre instead of forcing a getBoundingClientRect() read for every
    // lyric line on each pointer frame.
    const center = container.scrollTop + container.clientHeight / 2;
    let low = 0;
    let high = rows.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const row = rows[middle];
      const rowCenter = row.offsetTop + row.offsetHeight / 2;
      if (rowCenter < center) low = middle + 1;
      else high = middle - 1;
    }

    const candidates = [rows[Math.max(0, high)], rows[Math.min(rows.length - 1, low)]];
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const row of candidates) {
      const index = Number(row.dataset.index);
      if (!Number.isFinite(index)) continue;
      const distance = Math.abs(row.offsetTop + row.offsetHeight / 2 - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  const showScrub = () => {
    // Pointer/touch move can fire more often than the browser can paint. Reading
    // every lyric row's layout on each event forces repeated synchronous layout
    // work, which is especially visible on low-end WebViews. Coalesce the read
    // and state update to one animation frame.
    if (scrubFrameRef.current !== null) return;
    scrubFrameRef.current = window.requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      setScrubTarget(centerLineIndex());
    });
  };

  const scheduleHideScrub = () => {
    clearTimer(hideTimerRef);
    hideTimerRef.current = window.setTimeout(() => {
      if (!touchingRef.current) setScrubTarget(null);
      hideTimerRef.current = null;
    }, 1600);
  };

  const releaseDrag = () => {
    const wasDragging = dragStartedRef.current;
    touchingRef.current = false;
    dragStartedRef.current = false;
    if (!wasDragging) return;
    setDragging(false);
    enterManualMode();
    scheduleResume();
    scheduleHideScrub();
  };

  const seekToLyric = (time: number) => {
    clearTimer(autoResumeTimerRef);
    clearTimer(wheelReleaseTimerRef);
    cancelScrollAnimation();
    userScrollingRef.current = false;
    touchingRef.current = false;
    dragStartedRef.current = false;
    setDragging(false);
    setManualMode(false);
    setScrubTarget(null);
    onDraggingChange?.(false);
    playerController.seek(time + offset);
  };
  seekToLyricRef.current = seekToLyric;

  useEffect(() => {
    if (userScrollingRef.current || touchingRef.current) return;
    const target = lyricTarget(activeIndex);
    if (target !== null) animateScrollTo(target);
    // The target is derived from the rendered lyric row and current track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, track.id]);

  useEffect(() => {
    const onPointerUp = () => {
      if (touchingRef.current) releaseDrag();
    };
    const onPointerCancel = () => {
      if (touchingRef.current) releaseDrag();
    };
    const onTouchEnd = () => {
      if (touchingRef.current) releaseDrag();
    };
    const onTouchCancel = () => {
      if (touchingRef.current) releaseDrag();
    };
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
    // Handlers use refs, so they do not need to be recreated on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || (event.button !== undefined && event.button !== 0)) return;
    touchingRef.current = true;
    dragStartedRef.current = false;
    draggedRef.current = false;
    dragStartYRef.current = event.clientY;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!touchingRef.current || event.pointerType === 'mouse') return;
    if (!dragStartedRef.current && Math.abs(event.clientY - dragStartYRef.current) >= TOUCH_SLOP) {
      dragStartedRef.current = true;
      draggedRef.current = true;
      enterManualMode();
      setDragging(true);
      showScrub();
    } else if (dragStartedRef.current) {
      showScrub();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchingRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchingRef.current = true;
    dragStartedRef.current = false;
    draggedRef.current = false;
    dragStartYRef.current = touch.clientY;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchingRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    if (!dragStartedRef.current && Math.abs(touch.clientY - dragStartYRef.current) >= TOUCH_SLOP) {
      dragStartedRef.current = true;
      draggedRef.current = true;
      enterManualMode();
      setDragging(true);
      showScrub();
    } else if (dragStartedRef.current) {
      showScrub();
    }
  };

  const handleWheel = () => {
    enterManualMode();
    setDragging(false);
    showScrub();
    clearTimer(wheelReleaseTimerRef);
    wheelReleaseTimerRef.current = window.setTimeout(() => {
      wheelReleaseTimerRef.current = null;
      scheduleResume();
      scheduleHideScrub();
    }, 180);
  };

  const renderBody = () => {
    if (!lines.length) {
      return (
        <div className="lyrics__empty">
          <div className="lyrics__empty-title">
            {loadError || (loaded ? '这首歌暂时没有歌词' : '歌词加载中…')}
          </div>
          {loaded ? (
            <div className="lyrics__empty-actions">
              <button
                type="button"
                className="lyrics__empty-action"
                onClick={() => {
                  setLines([]);
                  setLoaded(false);
                  setLoadError('');
                  setRequest((value) => value + 1);
                }}
              >
                重新获取
              </button>
              <button
                type="button"
                className="lyrics__empty-action"
                onClick={() => fileInputRef.current?.click()}
              >
                导入本地歌词
              </button>
            </div>
          ) : null}
          {importError ? <div className="lyrics__empty-error">{importError}</div> : null}
          <input
            ref={fileInputRef}
            className="lyrics__file-input"
            type="file"
            accept=".lrc,.ttml,.xml,text/plain,application/xml,text/xml"
            aria-label="选择本地 LRC 或 TTML 歌词文件"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              void importLyrics(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      );
    }

    const clearRows = manualMode || dragging || scrubIdx !== null;
    return lines.map((line, index) => {
      const gap = index > 0 ? line.time - lines[index - 1].time : 0;
      return (
        <Fragment key={track.id + '-' + index}>
          {gap >= 5 ? (
            <div className="lyrics__interlude" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          <LyricRow
            line={line}
            index={index}
            activeIndex={activeIndex}
            wordTime={
              index === activeIndex && !voices.duet && !voices.lines[index].allBackground
                ? playbackTime - offset
                : 0
            }
            showTrans={showTrans}
            clearRows={clearRows}
            duet={voices.duet}
            side={voices.duet ? voiceSide(voices.lines[index].voice) : 'center'}
            parsed={voices.lines[index]}
            seekRef={seekToLyricRef}
            draggedRef={draggedRef}
          />
        </Fragment>
      );
    });
  };

  return (
    <div
      className={
        'lyrics-wrap' +
        (scrubIdx !== null ? ' lyrics-wrap--scrubbing' : '') +
        (dragging ? ' lyrics-wrap--dragging' : '') +
        (manualMode ? ' lyrics-wrap--manual' : '')
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releaseDrag}
      onPointerCancel={releaseDrag}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={releaseDrag}
      onTouchCancel={releaseDrag}
    >
      <div
        className="lyrics"
        ref={containerRef}
        onWheel={handleWheel}
        onScroll={() => {
          if (dragStartedRef.current) showScrub();
        }}
      >
        <div className="lyrics__spacer" />
        {renderBody()}
        <div className="lyrics__spacer" />
      </div>

      <div className="lyrics__controls">
        <button
          type="button"
          className="lyrics__ctl-btn"
          aria-label="减小歌词字号"
          onClick={(event) => {
            event.stopPropagation();
            bumpScale(-0.1);
          }}
        >
          A−
        </button>
        <button
          type="button"
          className="lyrics__ctl-btn"
          aria-label="增大歌词字号"
          onClick={(event) => {
            event.stopPropagation();
            bumpScale(0.1);
          }}
        >
          A+
        </button>
        <button
          type="button"
          className={'lyrics__ctl-btn' + (showTrans ? ' lyrics__ctl-btn--on' : '')}
          aria-label="显示或隐藏翻译"
          onClick={(event) => {
            event.stopPropagation();
            toggleTrans();
          }}
        >
          译
        </button>
        <button
          type="button"
          className={'lyrics__ctl-btn' + (offset !== 0 ? ' lyrics__ctl-btn--on' : '')}
          aria-label="歌词时间偏移调整"
          aria-pressed={offsetOpen}
          onClick={(event) => {
            event.stopPropagation();
            setOffsetOpen((value) => !value);
          }}
        >
          偏移
        </button>
      </div>

      {offsetOpen ? (
        <div className="lyrics__offset" onClick={(event) => event.stopPropagation()}>
          <div className="lyrics__offset-row">
            <button type="button" className="lyrics__ctl-btn" aria-label="歌词提前" onClick={() => nudgeOffset(-1)}>
              −{LYRIC_OFFSET_STEP}s
            </button>
            <span className="lyrics__offset-val">
              {(offset > 0 ? '+' : '') + offset.toFixed(1)}s
            </span>
            <button type="button" className="lyrics__ctl-btn" aria-label="歌词延后" onClick={() => nudgeOffset(1)}>
              +{LYRIC_OFFSET_STEP}s
            </button>
            <button type="button" className="lyrics__ctl-btn" onClick={() => setOffset(0)}>
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
            type="button"
            className="lyrics__scrub-btn"
            aria-label="跳转到这句"
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const targetIndex = scrubIdxRef.current;
              if (targetIndex === null || !lines[targetIndex]) return;
              seekToLyric(lines[targetIndex].time);
            }}
          >
            <Icon name="play" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
