import './notify.css';

/** Minimal toast - no design-system dependency, callable from any layer. */
export function notify(message: string, ms = 3000): void {
  const el = document.createElement('div');
  el.className = 'aurora-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.classList.add('aurora-toast--out'), ms);
  window.setTimeout(() => el.remove(), ms + 320);
}