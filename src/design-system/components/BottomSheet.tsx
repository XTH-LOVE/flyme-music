import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ds.css';

interface BottomSheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** 'sheet' (default) slides from bottom; 'drawer' docks right on desktop. */
  variant?: 'sheet' | 'drawer';
}

/** Bottom sheet with slide-up motion; drawer variant on desktop. */
export function BottomSheet({ open, title, onClose, children, variant = 'sheet' }: BottomSheetProps) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 260);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, visible]);

  // Esc dismisses the sheet like a native modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!visible) return null;

  const cls =
    'am-sheet-root' +
    (variant === 'drawer' ? ' am-sheet-root--drawer' : '') +
    (closing ? ' am-sheet-root--closing' : '');

  return createPortal(
    <div className={cls}>
      <div className="am-sheet-scrim" onClick={onClose} />
      <div className="am-sheet">
        <div className="am-sheet__grab" />
        {title ? <div className="am-sheet__title">{title}</div> : null}
        <div className="am-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
