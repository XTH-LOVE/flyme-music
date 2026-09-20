import './notify.css';

let stack: HTMLElement | null = null;

function ensureStack(): HTMLElement {
  if (stack && stack.isConnected) return stack;
  stack = document.createElement('div');
  stack.className = 'aurora-toasts';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}

const MAX_VISIBLE = 3;

/**
 * Stacking toast - no design-system dependency, callable from any layer.
 * Concurrent calls stack vertically (newest last) instead of overlapping.
 */
export function notify(message: string, ms = 3000): void {
  const host = ensureStack();
  const el = document.createElement('div');
  el.className = 'aurora-toast';
  el.textContent = message;
  host.appendChild(el);
  while (host.childElementCount > MAX_VISIBLE) {
    host.firstElementChild?.remove();
  }
  window.setTimeout(() => el.classList.add('aurora-toast--out'), ms);
  window.setTimeout(() => {
    el.remove();
    if (host.isConnected && !host.childElementCount) {
      host.remove();
      stack = null;
    }
  }, ms + 320);
}
