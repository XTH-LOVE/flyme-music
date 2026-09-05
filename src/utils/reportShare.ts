import { buildListeningReport, formatReportDuration, rangeLabel, type ListeningReport } from './listeningReport';
import { saveBlobInBrowser } from './saveBlob';
import { isTauri } from '@/lib/apiTransport';
import { notify } from './notify';
import type { PlayLogEntry } from '@/store/useLibraryStore';

/**
 * Render a shareable listening-report card (canvas → PNG), mirroring the
 * lyric share card. Text-only; no external images so the canvas stays
 * untainted and renders reliably across devices.
 */

const W = 1080;
const H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  return out;
}

export async function shareListeningReport(
  playLog: PlayLogEntry[],
  range: ListeningReport['range'],
): Promise<boolean> {
  const report = buildListeningReport(playLog, range);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  // Background gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3d7bff');
  grad.addColorStop(1, '#1b2a5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Title.
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('我的听歌报告', W / 2, 160);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '400 32px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(rangeLabel(range, Date.now()), W / 2, 220);

  // Big number: total plays.
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 120px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(String(report.total), W / 2, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '400 30px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('累计播放', W / 2, 450);

  // Stat row.
  const stats = [
    { label: '歌曲', value: String(report.distinctSongs) },
    { label: '歌手', value: String(report.distinctArtists) },
    { label: '活跃天数', value: String(report.activeDays) },
  ];
  const statW = 280;
  let sx = (W - statW * stats.length) / 2;
  for (const s of stats) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 56px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(s.value, sx + statW / 2, 620);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '400 26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(s.label, sx + statW / 2, 668);
    sx += statW;
  }

  // Estimated duration line.
  if (report.estimatedSeconds > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '400 30px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('约 ' + formatReportDuration(report.estimatedSeconds) + ' 的音乐时光', W / 2, 740);
  }

  // Top songs.
  let y = 820;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 34px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('常听歌曲', 120, y);
  y += 56;
  ctx.font = '400 28px system-ui, "Microsoft YaHei", sans-serif';
  for (const [i, s] of report.topSongs.entries()) {
    ctx.fillStyle = '#ffffff';
    const line = (i + 1) + '. ' + s.name;
    const rows = wrap(ctx, line, W - 240);
    for (const row of rows) {
      ctx.fillText(row, 120, y);
      y += 44;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 24px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(s.artist + ' · ' + s.count + ' 次', 148, y);
    ctx.font = '400 28px system-ui, "Microsoft YaHei", sans-serif';
    y += 60;
  }

  // Footer.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '400 22px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('Aurora Music · 听歌报告', W / 2, H - 60);

  const fileName = '听歌报告-' + rangeLabel(range, Date.now()) + '.png';
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('save_image_base64', { fileName, dataUrl: canvas.toDataURL('image/png') });
    notify('报告卡片已保存');
    return true;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  await saveBlobInBrowser(blob, fileName);
  return true;
}
