import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

/* ------------------------------------------------------------------
 * Dev-server proxies: bypass CORS / hotlink blocks for Netease weapi,
 * QQ Music official endpoints, cover images and media downloads.
 * Same architecture as Otter Music's backend, inlined for a
 * pure-frontend dev setup.
 * ------------------------------------------------------------------ */

const NONCE = '0CoJUm6Qyw8W8jud';
const IV = '0102030405060708';
const PUB_KEY = '010001';
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7' +
  'b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280' +
  '104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932' +
  '575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b' +
  '3ece0462db0a22b8e7';
const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function createSecretKey(size: number): string {
  const choice = '012345679abcdef';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += choice[Math.floor(Math.random() * choice.length)];
  }
  return result;
}

function aesEncrypt(text: string, key: string): Buffer {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(IV, 'utf8'),
  );
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function rsaEncrypt(secKey: string): string {
  const reversed = Buffer.from(secKey.split('').reverse().join(''), 'utf8');
  const b = BigInt('0x' + reversed.toString('hex'));
  const enc = modPow(b, BigInt('0x' + PUB_KEY), BigInt('0x' + MODULUS));
  return enc.toString(16).padStart(256, '0');
}

function weapi(object: unknown): { params: string; encSecKey: string } {
  const text = JSON.stringify(object);
  const secKey = createSecretKey(16);
  const enc1 = aesEncrypt(text, NONCE).toString('base64');
  const enc2 = aesEncrypt(enc1, secKey).toString('base64');
  return { params: enc2, encSecKey: rsaEncrypt(secKey) };
}

function buildVisitorCookie(): string {
  const nuid = createSecretKey(32);
  const nnid = nuid + ',' + Date.now();
  return 'os=pc; appver=2.9.7; mode=31; _ntes_nuid=' + nuid + '; _ntes_nnid3=' + nnid + '; NMTID=0;';
}

/** Preserve the actual login session issued in Netease's Set-Cookie headers. */
function getResponseCookie(headers: Headers): string {
  const setCookieHeaders = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
  return setCookieHeaders
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value))
    .join('; ');
}

type AuroraAccount = { id: string; username: string; nickname: string; avatarUrl?: string; passwordHash: string };
const authFile = path.resolve(process.cwd(), '.aurora-auth.json');
const authTokens = new Map<string, string>();
function readAuroraAccounts(): Record<string, AuroraAccount> {
  try { return JSON.parse(fs.readFileSync(authFile, 'utf8')) as Record<string, AuroraAccount>; } catch { return {}; }
}
function writeAuroraAccounts(accounts: Record<string, AuroraAccount>) {
  fs.writeFileSync(authFile, JSON.stringify(accounts, null, 2), 'utf8');
}
function hashAuroraPassword(password: string, salt: string) {
  return salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
}
function verifyAuroraPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return Boolean(salt && hash) && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 32));
}
function auroraAuthProxy(): Plugin {
  return { name: 'aurora-auth-api', configureServer(server) {
    server.middlewares.use('/api/auth', (req, res) => {
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const send = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        try {
          const payload = body ? JSON.parse(body) as Record<string, string> : {};
          const accounts = readAuroraAccounts();
          const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
          const username = payload.username?.trim().toLowerCase();
          if (req.url === '/register' && req.method === 'POST') {
            if (!username || !/^[^@\s]{3,64}@[^ @\s]{2,64}\.[^\s@]{2,24}$/i.test(username) || !payload.password || payload.password.length < 6) return send(400, { message: '请输入有效邮箱，密码至少 6 位' });
            if (accounts[username]) return send(409, { message: '账号已存在，请直接登录' });
            const salt = crypto.randomBytes(16).toString('hex');
            const account = { id: crypto.randomUUID(), username, nickname: username, passwordHash: hashAuroraPassword(payload.password, salt) };
            accounts[username] = account; writeAuroraAccounts(accounts);
            const token = crypto.randomBytes(32).toString('hex'); authTokens.set(token, username);
            return send(200, { token, user: { id: account.id, username, nickname: account.nickname } });
          }
          if (req.url === '/login' && req.method === 'POST') {
            const account = username ? accounts[username] : undefined;
            if (!account || !payload.password || !verifyAuroraPassword(payload.password, account.passwordHash)) return send(401, { message: '账号或密码错误' });
            const token = crypto.randomBytes(32).toString('hex'); authTokens.set(token, username);
            return send(200, { token, user: { id: account.id, username, nickname: account.nickname, avatarUrl: account.avatarUrl } });
          }
          const sessionUser = authTokens.get(auth);
          if (req.url === '/profile' && req.method === 'PATCH' && sessionUser && accounts[sessionUser]) {
            const account = accounts[sessionUser]; account.nickname = payload.nickname?.trim() || account.nickname; account.avatarUrl = payload.avatarUrl?.trim() || undefined; writeAuroraAccounts(accounts);
            return send(200, { user: { id: account.id, username: account.username, nickname: account.nickname, avatarUrl: account.avatarUrl } });
          }
          if (req.url === '/me' && req.method === 'GET' && sessionUser && accounts[sessionUser]) { const a = accounts[sessionUser]; return send(200, { user: { id: a.id, username: a.username, nickname: a.nickname, avatarUrl: a.avatarUrl } }); }
          send(401, { message: '未登录' });
        } catch { send(400, { message: '请求格式错误' }); }
      });
    });
  } };
}

function neteaseWeapiProxy(): Plugin {
  return {
    name: 'aurora-netease-weapi-proxy',
    configureServer(server) {
      server.middlewares.use('/api/netease/weapi', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method not allowed' }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const { path: apiPath, data, cookie } = JSON.parse(body) as {
              path: string;
              data: Record<string, unknown>;
              cookie?: string;
            };
            if (!apiPath || !apiPath.startsWith('/weapi/')) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'bad path' }));
              return;
            }
            const form = weapi(data ?? {});
            const userCookie = typeof cookie === 'string' && cookie.length <= 12000
              ? cookie.replace(/[\r\n]/g, '').trim()
              : '';
            const upstream = await fetch('https://music.163.com' + apiPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': PC_USER_AGENT,
                Referer: 'https://music.163.com',
                Origin: 'https://music.163.com',
                Cookie: userCookie ? userCookie + '; ' + buildVisitorCookie() : buildVisitorCookie(),
              },
              body: new URLSearchParams(form).toString(),
            });
            let json = await upstream.text();
            if (apiPath === '/weapi/login/qrcode/client/login') {
              try {
                const result = JSON.parse(json) as Record<string, unknown>;
                const loginCookie = getResponseCookie(upstream.headers);
                // A successful QR authorization puts the session only in Set-Cookie.
                // Return it to the same local browser so it can load the user's account.
                if (result.code === 803 && loginCookie && typeof result.cookie !== 'string') {
                  json = JSON.stringify({ ...result, cookie: loginCookie });
                }
              } catch {
                // Keep the upstream response intact if it is not valid JSON.
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(json);
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

/** Generic remote-image proxy - bypasses CDN hotlink / referrer blocks. */
function imageProxy(): Plugin {
  return {
    name: 'aurora-image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/img', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const target = parsed.searchParams.get('url');
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: {
              'User-Agent': PC_USER_AGENT,
              Referer: new URL(target).origin + '/',
            },
          });
          if (!upstream.ok || !upstream.body) {
            res.statusCode = upstream.status || 502;
            res.end('upstream error');
            return;
          }
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'image/jpeg',
          );
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
          const reader = upstream.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}

/** Streams remote media through the dev server so downloads bypass CORS. */
function mediaDownloadProxy(): Plugin {
  return {
    name: 'aurora-media-download-proxy',
    configureServer(server) {
      server.middlewares.use('/api/media-proxy', (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const target = parsed.searchParams.get('url');
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        (async () => {
          try {
            const upstream = await fetch(target, {
              headers: {
                'User-Agent': PC_USER_AGENT,
                Referer: new URL(target).origin + '/',
              },
            });
            if (!upstream.ok || !upstream.body) {
              res.statusCode = upstream.status || 502;
              res.end('upstream error');
              return;
            }
            res.setHeader(
              'Content-Type',
              upstream.headers.get('content-type') ?? 'application/octet-stream',
            );
            const len = upstream.headers.get('content-length');
            if (len) res.setHeader('Content-Length', len);
            res.setHeader('Cache-Control', 'no-store');
            const reader = upstream.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          } catch (e) {
            res.statusCode = 502;
            res.end(String(e));
          }
        })();
      });
    },
  };
}

/** QQ Music official endpoints: chart detail, toplist cover, lyrics. */
function qqMusicProxy(): Plugin {
  return {
    name: 'aurora-qq-music-proxy',
    configureServer(server) {
      // 榜单详情（旧版接口，含 songmid / 时长 / 歌手 / 专辑）
      server.middlewares.use('/api/qq/chart', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const topId = Number(parsed.searchParams.get('topId') ?? 26);
        try {
          const upstream = await fetch(
            'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&type=top&topid=' +
              topId,
            {
              headers: {
                'User-Agent': PC_USER_AGENT,
                Referer: 'https://y.qq.com/',
              },
            },
          );
          const text = await upstream.text();
          res.setHeader('Content-Type', 'application/json');
          res.end(text.replace(/^\uFEFF/, ''));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

      // 榜单封面（拉前 5 名，取第一首有封面的歌，用于榜单卡片）
      server.middlewares.use('/api/qq/chart-top', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const topId = Number(parsed.searchParams.get('topId') ?? 26);
        try {
          const payload = JSON.stringify({
            detail: {
              module: 'musicToplist.ToplistInfoServer',
              method: 'GetDetail',
              param: { topId, offset: 0, num: 5 },
            },
          });
          const upstream = await fetch(
            'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(payload),
            {
              headers: { 'User-Agent': PC_USER_AGENT, Referer: 'https://y.qq.com/' },
            },
          );
          const json = (await upstream.json()) as {
            detail?: {
              data?: {
                data?: {
                  title?: string;
                  song?: { title?: string; singerName?: string; cover?: string }[];
                };
              };
            }
          };
          const d = json.detail?.data?.data;
          const songs = d?.song ?? [];
          const withCover = songs.find((s) => s.cover);
          let cover = (withCover?.cover ?? '').replace(/^http:/, 'https:');
          // 兑底：GetDetail 无封面时，用旧版榜单接口的 albummid 拼封面 URL
          if (!cover) {
            try {
              const legacyRes = await fetch(
                'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&type=top&topid=' +
                  topId,
                {
                  headers: { 'User-Agent': PC_USER_AGENT, Referer: 'https://y.qq.com/' },
                },
              );
              const legacyText = await legacyRes.text();
              const legacy = JSON.parse(legacyText.replace(/^﻿/, '')) as {
                songlist?: { data?: { albummid?: string } }[];
              };
              const mid = (legacy.songlist ?? [])
                .map((s) => s.data?.albummid)
                .find((m) => Boolean(m));
              if (mid) {
                cover = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + mid + '.jpg';
              }
            } catch {
              /* keep empty */
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              title: d?.title ?? '',
              topSong: songs[0]?.title ?? '',
              topSinger: songs[0]?.singerName ?? '',
              cover,
            }),
          );
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });

      // 歌词（LRC 明文）
      server.middlewares.use('/api/qq/lyric', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const mid = parsed.searchParams.get('mid') ?? '';
        if (!mid) {
          res.statusCode = 400;
          res.end(JSON.stringify({ lyric: '' }));
          return;
        }
        try {
          const upstream = await fetch(
            'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' +
              encodeURIComponent(mid) +
              '&format=json&nobase64=1&g_tk=5381',
            {
              headers: { 'User-Agent': PC_USER_AGENT, Referer: 'https://y.qq.com/' },
            },
          );
          const text = await upstream.text();
          res.setHeader('Content-Type', 'application/json');
          res.end(text.replace(/^\uFEFF/, ''));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ lyric: '', error: String(e) }));
        }
      });
    },
  };
}

/** OpenAI-compatible AI pass-through. Credentials stay in the dev server
 * environment and are never accepted from browser requests. */
function aiProxy(env: Record<string, string>): Plugin {
  const endpoint = (env.AURORA_AI_ENDPOINT || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
  const apiKey = env.AURORA_AI_API_KEY?.trim() ?? '';
  const configuredModel = env.AURORA_AI_MODEL?.trim() ?? '';
  const allowedPaths = new Set(['/models', '/chat/completions']);
  return {
    name: 'aurora-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai', (req, res) => {
        const subPath = (req.url ?? '').split('?')[0] || '/chat/completions';
        if (subPath === '/status') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ configured: Boolean(apiKey), endpoint, model: configuredModel }));
          return;
        }
        if (!allowedPaths.has(subPath)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'unsupported AI path' }));
          return;
        }
        if (!apiKey) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'AI server key is not configured' }));
          return;
        }
        const target = endpoint.replace(/\/$/, '') + subPath;
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const upstream = await fetch(target, {
              method: req.method || 'GET',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': PC_USER_AGENT,
                Authorization: 'Bearer ' + apiKey,
              },
              body: req.method === 'GET' ? undefined : body,
            });
            res.statusCode = upstream.status;
            res.setHeader(
              'Content-Type',
              upstream.headers.get('content-type') ?? 'application/json',
            );
            res.setHeader('Cache-Control', 'no-store');
            if (!upstream.body) {
              res.end(await upstream.text());
              return;
            }
            const reader = upstream.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AURORA_');
  return {
  plugins: [react(), auroraAuthProxy(), neteaseWeapiProxy(), imageProxy(), mediaDownloadProxy(), qqMusicProxy(), aiProxy(env)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      // Dual entry: main app (index.html) + official landing page (official.html).
      input: {
        main: path.resolve(__dirname, 'index.html'),
        official: path.resolve(__dirname, 'official.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
  };
});
