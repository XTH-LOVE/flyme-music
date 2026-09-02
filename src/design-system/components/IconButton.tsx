import type { ReactNode } from 'react';
import './ds.css';

interface IconButtonProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  accent?: boolean;
  active?: boolean;
  label?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function IconButton({
  children,
  size = 'md',
  accent = false,
  active = false,
  label,
  disabled,
  onClick,
}: IconButtonProps) {
  const cls = [
    'am-icon-btn',
    'am-icon-btn--' + size,
    accent ? 'am-icon-btn--accent' : '',
    active ? 'am-icon-btn--active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
