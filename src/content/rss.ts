export interface RssEpisode { id: string; title: string; audioUrl: string; description: string; publishedAt: string | null; coverUrl: string | null }
export interface RssFeed { title: string; description: string; link: string | null; coverUrl: string | null; episodes: RssEpisode[] }
function text(el: Element | null | undefined): string { return el?.textContent?.trim() ?? ''; }
function absolute(value: string, base: string): string | null { try { return value ? new URL(value, base).toString() : null; } catch { return null; } }
function clean(value: string): string { return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
export function parseRss(xml: string, feedUrl: string): RssFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('RSS 格式无效');
  const root = doc.querySelector('channel') ?? doc.querySelector('feed');
  const title = clean(text(root?.querySelector('title')));
  const description = clean(text(root?.querySelector('description, subtitle, summary')));
  const cover = root?.querySelector('image[url], itunes\\:image[href], logo, icon');
  const coverUrl = absolute(cover?.getAttribute('url') ?? cover?.getAttribute('href') ?? text(cover), feedUrl);
  const link = absolute(text(root?.querySelector('link[rel="alternate"], link')), feedUrl);
  const nodes = Array.from(doc.querySelectorAll('item, entry')).slice(0, 100);
  const episodes = nodes.flatMap((node, index) => {
    const enclosure = node.querySelector('enclosure[url], link[rel="enclosure"][href], media\\:content[url]');
    const audioUrl = absolute(enclosure?.getAttribute('url') ?? enclosure?.getAttribute('href') ?? '', feedUrl);
    if (!audioUrl) return [];
    const episodeTitle = clean(text(node.querySelector('title'))) || '未命名节目';
    return [{ id: text(node.querySelector('guid, id')) || audioUrl || String(index), title: episodeTitle,
      audioUrl, description: clean(text(node.querySelector('description, summary, content'))),
      publishedAt: text(node.querySelector('pubDate, published, updated')) || null,
      coverUrl: absolute(node.querySelector('itunes\\:image[href]')?.getAttribute('href') ?? '', feedUrl) ?? coverUrl }];
  });
  return { title, description, link, coverUrl, episodes };
}
export async function fetchRss(url: string, signal?: AbortSignal): Promise<RssFeed> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('RSS 请求失败：HTTP ' + response.status);
  return parseRss(await response.text(), url);
}
