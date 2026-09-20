import type { ReactNode } from 'react';
import './ds.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AppButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function AppButton({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  onClick,
}: AppButtonProps) {
  const cls = ['am-btn', 'am-btn--' + variant, 'am-btn--' + size, block ? 'am-btn--block' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
