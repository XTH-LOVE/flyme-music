import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ds.css';

interface DialogProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
}

export function Dialog({ open, title, children, onClose }: DialogProps) {
  // Esc dismisses the dialog like a native modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="am-dialog-root">
      <div className="am-sheet-scrim" onClick={onClose} />
      <div className="am-dialog">
        {title ? <div className="am-dialog__title">{title}</div> : null}
        <div className="am-dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
