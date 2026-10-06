import { httpFetch } from '@/lib/apiTransport';

export interface BillboardItem { rank: number; title: string; artist: string; coverUrl: string | null; url?: string; }
export interface BillboardResult { title: string; updatedAt: string | null; items: BillboardItem[]; }

function clean(value: string): string { return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

/** Parses common Billboard RSS/HTML feeds, keeping the provider replaceable. */
export function parseBillboard(text: string, baseUrl = 'https://www.billboard.com/'): BillboardResult {
  if (text.trim().startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const items = Array.from(doc.querySelectorAll('[class*="o-chart-results-list__item"], [data-title]')).slice(0, 100);
    const mapped = items.flatMap((node, index) => {
      const title = clean(node.querySelector('[class*="c-title"], [data-title]')?.textContent ?? node.getAttribute('data-title') ?? '');
      const artist = clean(node.querySelector('[class*="c-label"], [data-artist]')?.textContent ?? node.getAttribute('data-artist') ?? '');
      if (!title) return [];
      const image = node.querySelector('img')?.getAttribute('src') ?? null;
      const href = node.querySelector('a')?.getAttribute('href') ?? undefined;
      return [{ rank: index + 1, title, artist, coverUrl: image, url: href ? new URL(href, baseUrl).toString() : undefined }];
    });
    return { title: clean(doc.querySelector('title')?.textContent ?? 'Billboard'), updatedAt: null, items: mapped };
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { title: 'Billboard', updatedAt: null, items: lines.slice(0, 100).map((line, index) => {
    const [title, artist = ''] = line.split(/\s+-\s+/, 2);
    return { rank: index + 1, title, artist, coverUrl: null };
  }) };
}

export async function fetchBillboard(url: string, signal?: AbortSignal): Promise<BillboardResult> {
  const response = await httpFetch(url, { signal });
  if (!response.ok) throw new Error('Billboard 请求失败：HTTP ' + response.status);
  return parseBillboard(await response.text(), url);
}
