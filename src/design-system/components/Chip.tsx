import type { ReactNode } from 'react';
import './ds.css';

interface ChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function Chip({ children, active = false, onClick }: ChipProps) {
  return (
    <button className={'am-chip' + (active ? ' am-chip--active' : '')} onClick={onClick}>
      {children}
    </button>
  );
}
