import { useState } from 'react';

interface ExpandableTextProps {
  text: string;
  /** Visible lines before clamping. */
  lines?: number;
  className?: string;
}

/**
 * Long text clamped to `lines` with a tap-to-expand affordance. Renders as a
 * plain <p> when the text is short enough to never clamp.
 */
export function ExpandableText({ text, lines = 2, className = '' }: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  // Detect clamping after layout: scrollHeight exceeds clientHeight when
  // the line clamp is active.
  const refCallback = (el: HTMLParagraphElement | null) => {
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 2);
  };

  return (
    <p
      ref={refCallback}
      className={
        className +
        ' clamp-text' +
        (open ? ' clamp-text--open' : clamped ? ' clamp-text--clamped' : '')
      }
      style={open ? undefined : ({ WebkitLineClamp: lines } as React.CSSProperties)}
      onClick={clamped ? () => setOpen(true) : undefined}
      role={clamped ? 'button' : undefined}
      title={clamped ? '点击展开全部' : undefined}
    >
      {text}
    </p>
  );
}
