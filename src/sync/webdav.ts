import { encryptString, decryptString } from '@/lib/cryptoStorage';
import { httpFetch } from '@/lib/apiTransport';
import { buildBackup, parseBackup, type BackupPayload, type FlymeBackup } from '@/utils/backup';

export interface WebDavConfig { url: string; username: string; password: string }
const KEY = 'flyme.webdav.config.v1';
const FILE = 'flyme-music-backup.json';

function base(url: string): string { return url.replace(/\/+$/, ''); }
function auth(cfg: WebDavConfig): string {
  const bytes = new TextEncoder().encode(cfg.username + ':' + cfg.password);
  let raw = ''; bytes.forEach((b) => { raw += String.fromCharCode(b); });
  return 'Basic ' + btoa(raw);
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<void> {
  const encoded = await encryptString(JSON.stringify(config));
  localStorage.setItem(KEY, encoded ?? JSON.stringify(config));
}
export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  const raw = localStorage.getItem(KEY); if (!raw) return null;
  const plain = await decryptString(raw);
  try { return JSON.parse(plain ?? raw) as WebDavConfig; } catch { return null; }
}
async function request(cfg: WebDavConfig, method: string, body?: string): Promise<Response> {
  return httpFetch(base(cfg.url) + '/' + FILE, {
    method,
    headers: { Authorization: auth(cfg), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body,
  });
}
export async function uploadLibraryBackup(cfg: WebDavConfig, payload: BackupPayload): Promise<void> {
  const response = await request(cfg, 'PUT', JSON.stringify(buildBackup(payload)));
  if (!response.ok) throw new Error('WebDAV 上传失败：HTTP ' + response.status);
}
export async function downloadLibraryBackup(cfg: WebDavConfig): Promise<FlymeBackup> {
  const response = await request(cfg, 'GET');
  if (response.status === 404) throw new Error('WebDAV 暂无备份');
  if (!response.ok) throw new Error('WebDAV 下载失败：HTTP ' + response.status);
  const parsed = parseBackup(await response.json());
  if (!parsed) throw new Error('云端备份格式无效');
  return parsed;
}
export async function testWebDav(cfg: WebDavConfig): Promise<void> {
  const response = await httpFetch(base(cfg.url), { method: 'OPTIONS', headers: { Authorization: auth(cfg) } });
  if (response.status === 401 || response.status === 403) throw new Error('WebDAV 认证失败');
  if (!response.ok && response.status !== 405) throw new Error('WebDAV 连接失败：HTTP ' + response.status);
}
