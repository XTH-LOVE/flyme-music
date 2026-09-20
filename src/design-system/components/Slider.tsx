import './ds.css';

interface SliderProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

/** Styled range input following the accent color. */
export function Slider({ value, max, onChange, onCommit }: SliderProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <input
      type="range"
      className="am-slider"
      min={0}
      max={max}
      step={0.1}
      value={value}
      style={{ '--am-slider-fill': percent + '%' } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}
