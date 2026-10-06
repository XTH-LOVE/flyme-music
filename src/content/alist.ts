import { httpFetch } from '@/lib/apiTransport';

export interface AlistConfig { url: string; token?: string; }
export interface AlistEntry { name: string; path: string; isDir: boolean; size: number; modified: string; url?: string; }
interface AlistResponse { code: number; message?: string; data?: { content?: Array<{ name: string; path: string; is_dir: boolean; size: number; modified: string; url?: string }>; }
}

function base(url: string): string { return url.replace(/\/+$/, ''); }
function headers(config: AlistConfig): HeadersInit { return config.token ? { Authorization: config.token } : {}; }

/** Lists an Alist folder without assuming a particular deployment version. */
export async function listAlist(config: AlistConfig, path = '/'): Promise<AlistEntry[]> {
  const response = await httpFetch(base(config.url) + '/api/fs/list', {
    method: 'POST',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, password: '', page: 1, per_page: 1000, refresh: false }),
  });
  if (!response.ok) throw new Error('Alist 请求失败：HTTP ' + response.status);
  const json = (await response.json()) as AlistResponse;
  if (json.code !== 200) throw new Error(json.message || 'Alist 返回错误');
  return (json.data?.content ?? []).map((item) => ({
    name: item.name, path: item.path, isDir: item.is_dir, size: item.size, modified: item.modified, url: item.url,
  }));
}

export async function getAlistDownloadUrl(config: AlistConfig, path: string): Promise<string> {
  const response = await httpFetch(base(config.url) + '/api/fs/get', {
    method: 'POST',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error('Alist 获取音频地址失败：HTTP ' + response.status);
  const json = (await response.json()) as { code: number; message?: string; data?: { raw_url?: string } };
  if (json.code !== 200 || !json.data?.raw_url) throw new Error(json.message || 'Alist 文件不可用');
  return json.data.raw_url;
}

export function isAlistAudio(entry: AlistEntry): boolean {
  return !entry.isDir && /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm)$/i.test(entry.name);
}
