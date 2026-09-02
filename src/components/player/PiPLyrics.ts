import { playerController } from '@/player';
import { fetchLyricLines, lyricLineAt, type MiniLyricLine } from '@/utils/currentLyric';

/**
 * Desktop lyric overlay via the Document Picture-in-Picture API
 * (Chrome 116+). Web equivalent of Halcyon's floating desktop lyric.
 */
let pipWin: Window | null = null;
let timer: number | null = null;
let lines: MiniLyricLine[] = [];
let lastKey = '';

export function pipSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

export function isPipOpen(): boolean {
  return pipWin !== null;
}

export function closePiPLyrics(): void {
  pipWin?.close();
}

function cleanup(): void {
  if (pipWin && timer !== null) pipWin.clearInterval(timer);
  timer = null;
  pipWin = null;
  lines = [];
  lastKey = '';
}

export async function openPiPLyrics(): Promise<boolean> {
  if (!pipSupported()) return false;
  if (pipWin) {
    pipWin.focus();
    return true;
  }
  const api = (window as unknown as { documentPictureInPicture: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
  try {
    pipWin = await api.requestWindow({ width: 500, height: 170 });
  } catch {
    return false;
  }
  const doc = pipWin.document;
  doc.title = 'Aurora 桌面歌词';
  const body = doc.body;
  body.style.margin = '0';
  body.style.background = '#0c0c12';
  body.style.color = '#fff';
  body.style.fontFamily = 'system-ui, "Microsoft YaHei", sans-serif';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.alignItems = 'center';
  body.style.justifyContent = 'center';
  body.style.height = '100vh';
  body.style.overflow = 'hidden';
  body.style.userSelect = 'none';

  const titleEl = doc.createElement('div');
  titleEl.style.cssText = 'font-size:12px;opacity:.55;margin-bottom:8px;';
  const lyricEl = doc.createElement('div');
  lyricEl.style.cssText =
    'font-size:21px;font-weight:700;text-align:center;padding:0 18px;line-height:1.45;';
  const transEl = doc.createElement('div');
  transEl.style.cssText = 'font-size:13px;opacity:.6;margin-top:6px;text-align:center;padding:0 18px;';
  body.append(titleEl, lyricEl, transEl);

  const refresh = () => {
    const snap = playerController.snapshot();
    const track = snap.current;
    if (!track) {
      titleEl.textContent = '未在播放';
      lyricEl.textContent = '';
      transEl.textContent = '';
      return;
    }
    const key = track.source + ':' + track.id;
    if (key !== lastKey) {
      lastKey = key;
      lines = [];
      void fetchLyricLines(track).then((l) => {
        if (lastKey === key) lines = l;
      });
    }
    titleEl.textContent = track.name + ' - ' + track.artist.join(' / ');
    const line = lyricLineAt(lines, snap.currentTime);
    lyricEl.textContent = line?.text ?? '♪';
    transEl.textContent = line?.trans ?? '';
  };
  refresh();
  timer = pipWin.setInterval(refresh, 400);
  pipWin.addEventListener('pagehide', cleanup);
  return true;
}
