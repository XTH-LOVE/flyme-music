import { useRef, useState } from 'react';
import './fast-index.css';

interface FastIndexBarProps {
  /** Letters to render, top to bottom. */
  letters: string[];
  /** Fired when the finger lands on a different letter. */
  onLetterChange: (letter: string) => void;
  /** Letters that actually have entries; the rest render dimmed. */
  available?: ReadonlySet<string>;
  className?: string;
}

/**
 * Halcyon throttles dispatch to 80ms (`FastIndexBar.kt`). Without it, dragging
 * the full height of the bar would fire 26 scrolls inside a few frames and the
 * page would never settle.
 */
const REPEAT_MS = 80;
/** Vibration length, matching a clock tick. */
const TICK_MS = 8;

/**
 * A–Z scrubber for long lists, ported from Halcyon's FastIndexBar.
 *
 * Hidden from assistive tech on purpose: it is a touch-only shortcut whose
 * entire effect (scrolling the list) is reachable by scrolling. Announcing a
 * 27-button strip with no accessible name would be worse than omitting it.
 */
export function FastIndexBar({ letters, onLetterChange, available, className }: FastIndexBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [bubbleTop, setBubbleTop] = useState(0);
  const last = useRef({ letter: '', at: 0 });

  const selectAt = (clientY: number, force = false) => {
    const bar = barRef.current;
    const container = containerRef.current;
    if (!bar || !container || letters.length === 0) return;
    const barRect = bar.getBoundingClientRect();
    if (barRect.height <= 0) return;

    const ratio = (clientY - barRect.top) / barRect.height;
    const index = Math.max(0, Math.min(letters.length - 1, Math.floor(ratio * letters.length)));
    const letter = letters[index];

    const now = Date.now();
    if (!force && (letter === last.current.letter || now - last.current.at < REPEAT_MS)) return;
    last.current = { letter, at: now };

    // The bubble is positioned against the container, not the bar, so the bar's
    // own offset (container padding) has to be added back in.
    const containerRect = container.getBoundingClientRect();
    const offset = barRect.top - containerRect.top;
    setBubbleTop(offset + (index + 0.5) * (barRect.height / letters.length));
    setActive(letter);
    onLetterChange(letter);
    navigator.vibrate?.(TICK_MS);
  };

  const end = () => {
    last.current = { letter: '', at: 0 };
    setActive(null);
  };

  return (
    <div
      ref={containerRef}
      className={'fast-index' + (active ? ' fast-index--active' : '') + (className ? ' ' + className : '')}
      aria-hidden="true"
    >
      <div
        ref={barRef}
        className="fast-index__bar"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          selectAt(e.clientY, true);
        }}
        onPointerMove={(e) => selectAt(e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {letters.map((letter) => (
          <span
            key={letter}
            className={
              'fast-index__letter' +
              (letter === active ? ' fast-index__letter--on' : '') +
              (available && !available.has(letter) ? ' fast-index__letter--empty' : '')
            }
          >
            {letter}
          </span>
        ))}
      </div>
      <span className="fast-index__bubble" style={{ top: bubbleTop }}>
        {active ?? ''}
      </span>
    </div>
  );
}
