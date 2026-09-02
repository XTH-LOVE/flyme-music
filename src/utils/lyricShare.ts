import { fetchLyricLines, lyricLineAt } from './currentLyric';
import { fetchImageBlob } from './imageSource';
import { resolveTrackPic } from '@/music/source/track-resolver';
import { fallbackPalette } from '@/utils/palette';
import type { MusicTrack } from '@/music/source/types';

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      out.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

/** Halcyon LyricShareCard-style: render lyric card image and download it. */
export async function shareLyricCard(track: MusicTrack, currentTime: number): Promise<boolean> {
  const lines = await fetchLyricLines(track);
  const active = lyricLineAt(lines, currentTime) ?? lines[0] ?? null;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const palette = track.palette ?? fallbackPalette(track.id);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, palette[1] ?? palette[0]);
  grad.addColorStop(1, palette[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, W, H);

  // Cover bytes keep the canvas readable: CDN hotlinks fail outright
  // without a Referer, and cross-origin images would taint the canvas.
  const pic = await resolveTrackPic(track, 500).catch(() => null);
  let y = 130;
  let objectUrl = '';
  if (pic) {
    try {
      const blob = await fetchImageBlob(pic);
      if (!blob) throw new Error('cover');
      objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img'));
        img.src = objectUrl;
      });
      const size = 460;
      const x = (W - size) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 28);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      y += size + 64;
    } catch {
      /* no cover - text-only card */
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(track.name, W / 2, y + 20, W - 160);
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.font = '400 26px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(track.artist.join(' / '), W / 2, y + 70, W - 160);

  if (active) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px system-ui, "Microsoft YaHei", sans-serif';
    const rows = wrapText(ctx, active.text, W - 200);
    let ly = y + 190;
    for (const row of rows) {
      ctx.fillText(row, W / 2, ly);
      ly += 62;
    }
    if (active.trans) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '400 28px system-ui, "Microsoft YaHei", sans-serif';
      const trows = wrapText(ctx, active.trans, W - 240).slice(0, 2);
      ly += 14;
      for (const row of trows) {
        ctx.fillText(row, W / 2, ly);
        ly += 44;
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '400 22px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('Flyme Music', W / 2, H - 60);

  const a = document.createElement('a');
  a.download = track.name + '-歌词卡片.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  return true;
}
