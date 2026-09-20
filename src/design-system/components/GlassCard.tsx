import type { ReactNode } from 'react';
import './ds.css';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

/** Restrained liquid-glass surface - use sparingly. */
export function GlassCard({ children, className, onClick }: GlassCardProps) {
  return (
    <div className={'am-glass ' + (className ?? '')} onClick={onClick}>
      {children}
    </div>
  );
}
