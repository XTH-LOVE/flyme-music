import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { AI_DEFAULT_ENDPOINT, AI_DEFAULT_MODEL } from './src/lib/apiGuard';
import { ALLOWED_PATHS, bilibiliUpstream, isUpstreamFailure } from './src/lib/bilibiliServer';

/* ------------------------------------------------------------------
 * Dev-server proxies: bypass CORS / hotlink blocks for Netease weapi,
 * QQ Music official endpoints, cover images and media downloads.
 * Same architecture as Otter Music's backend, inlined for a
 * pure-frontend dev setup.
 * ------------------------------------------------------------------ */

const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Preserve the actual login session issued in Netease's Set-Cookie headers. */
function getResponseCookie(headers: Headers): string {
  const setCookieHeaders = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
  return setCookieHeaders
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value))
    .join('; ');
}

/** Fresh random visitor identity for retry attempts (Netease risk-control
 * challenges bind to the request's _ntes_nuid). Mirrors reIdCookie in
 * server/auroraApi.ts. */
function reIdCookie(cookie: string): string {
  let nid = '';
  for (let i = 0; i < 32; i++) nid += '012345679abcdef'[Math.floor(Math.random() * 16)];
  return cookie
    .replace(/_ntes_nuid=[^;]*/, '_ntes_nuid=' + nid)
    .replace(/_ntes_nnid3=[^,;]*/, '_ntes_nnid3=' + nid + ',' + Date.now());
}

function isRiskBody(text: string): boolean {
  try {
    const code = (JSON.parse(text) as { code?: number }).code;
    return code === -462 || code === 462 || code === -460 || code === 460 || code === 512;
  } catch {
    return false;
  }
}

/**
 * PWA: precache the built shell so the web version can be installed and opened
 * offline. Deliberately conservative:
 *
 * - `/api/*` is never served from the SW (`navigateFallbackDenylist`), so the
 *   app's own backend always hits the network instead of a stale cache masking
 *   a real failure.
 * - Only same-origin build output is precached. Third-party audio/cover URLs
 *   are left to the app's own IndexedDB caches - precaching them here would
 *   store the same media twice.
 * - `autoUpdate` means a new deployment takes over on the next load, so users
 *   cannot get stranded on an old shell.
 */
function pwaPlugin() {
  return VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'flyme-mark.jpg'],
    manifest: {
      name: 'Flyme Music',
      short_name: 'Flyme',
      description: 'HyperOS 风格的现代音乐播放器：沉浸式歌词、动态环境色、轻量 Liquid Glass。',
      lang: 'zh-CN',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#101012',
      background_color: '#101012',
      icons: [
        // Only an SVG and a 1254px JPEG ship today, so the manifest declares
        // exactly those rather than inventing 192/512 PNGs that do not exist.
        // Chrome / Edge / Android accept the SVG; dropping real 192 and 512 PNG
        // files into public/ and listing them here would improve iOS.
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/flyme-mark.jpg', sizes: '1254x1254', type: 'image/jpeg', purpose: 'any' },
      ],
      /*
       * Long-press shortcuts on the installed icon. Halcyon exposes the same
       * thing from its launcher icon; on the web this is the only equivalent,
       * and it is worth having because the two destinations people actually
       * jump into - what they own, and what they have been listening to - are
       * both two taps deep in the sidebar.
       */
      shortcuts: [
        {
          name: '本地音乐',
          short_name: '本地',
          url: '/local',
          description: '播放本设备上的音频文件',
          icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
        {
          name: '听歌统计',
          short_name: '统计',
          url: '/stats',
          description: '播放报告与听歌日历',
          icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
        {
          name: '搜索',
          short_name: '搜索',
          url: '/search',
          description: '跨音源搜索歌曲',
          icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
      ],
    },
    workbox: {
      /*
       * Precache the app shell only - HTML plus the icons. Precaching every
       * built chunk meant roughly 1.1MB downloaded in the background on each
       * update, competing with cover art and audio at exactly the moment the
       * user is waiting on them.
       *
       * The JS/CSS chunks are content-hashed, so they are immutable: they get
       * cached on first use (below), which keeps repeat visits and offline use
       * working without paying for them upfront.
       */
      globPatterns: ['**/*.{html,svg,png,jpg,jpeg,ico}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: /\/assets\/.*\.(?:js|css|woff2)$/,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'aurora-assets',
            expiration: {
              maxEntries: 80,
              maxAgeSeconds: 60 * 60 * 24 * 7,
            },
          },
        },
      ],
    },
  });
}


/** Dev-only forwarder: the browser cannot POST to music.163.com (CORS) nor
 * read Set-Cookie. Encryption already happened in src/music/netease/weapi.ts.
 *
 * Retry policy is kept IDENTICAL to the deployed handlers
 * (server/auroraApi.ts handleNeteaseWeapi, functions/api/netease/weapi.ts):
 * risk control is probabilistic per egress IP/identity, so a fresh identity
 * usually clears it. Keeping dev in sync means a -462 that self-heals in
 * production also self-heals locally instead of only reproducing on a desk. */
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
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { path: apiPath, form, cookie } = JSON.parse(body) as {
              path: string;
              form: string;
              cookie?: string;
            };
            if (!apiPath || !apiPath.startsWith('/weapi/') || typeof form !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'bad path or form' }));
              return;
            }
            const safeCookie = typeof cookie === 'string' ? cookie : '';
            const relay = (attempt: number) =>
              fetch('https://music.163.com' + apiPath, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': PC_USER_AGENT,
                  Referer: 'https://music.163.com',
                  Origin: 'https://music.163.com',
                  Cookie: attempt === 0
                    ? safeCookie.replace(/[\r\n]/g, '').slice(0, 12000)
                    : reIdCookie(safeCookie),
                },
                body: form,
              });
            let upstream = await relay(0);
            let text = await upstream.text();
            for (const [i, delay] of [250, 700, 1500].entries()) {
              if (!isRiskBody(text)) break;
              await new Promise((r) => setTimeout(r, delay));
              upstream = await relay(i + 1);
              text = await upstream.text();
            }
            const joined = getResponseCookie(upstream.headers);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ body: text, cookies: joined ? joined.split('; ') : [] }));
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

/** Dev-only generic forwarder with a caller-supplied Referer. The packaged
 * app uses plugin-http instead, so this never ships. */
function genericProxy(): Plugin {
  return {
    name: 'aurora-generic-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const target = parsed.searchParams.get('url');
        const referer = parsed.searchParams.get('referer') ?? '';
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: {
              'User-Agent': PC_USER_AGENT,
              ...(referer ? { Referer: referer } : {}),
            },
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

/**
 * Dev-only Bilibili relay, mirroring functions/api/bilibili/[[path]].ts.
 *
 * Unlike the deployed relay it actually works: the dev server egresses from
 * the user's own connection, which bilibili's risk control does not block
 * (the Cloudflare datacenter IP is refused outright). Same whitelist and same
 * failure reasons, so a `blocked` seen locally means bilibili changed
 * something rather than that the local route is different.
 */
function bilibiliProxy(): Plugin {
  return {
    name: 'aurora-bilibili-proxy',
    configureServer(server) {
      server.middlewares.use('/api/bilibili', (req, res) => {
        void (async () => {
          const parsed = new URL(req.url ?? '', 'http://localhost');
          const apiPath = parsed.searchParams.get('path') ?? '';
          if (!ALLOWED_PATHS.has(apiPath)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'path not allowed' }));
            return;
          }
          const params = new URLSearchParams(parsed.searchParams);
          params.delete('path');
          const upstream = await bilibiliUpstream(apiPath, params);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          if (isUpstreamFailure(upstream)) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: 'bilibili unavailable', reason: upstream.failure }));
            return;
          }
          res.statusCode = upstream.status;
          res.end(upstream.body);
        })();
      });
    },
  };
}

/** Legacy unencrypted Netease channel relay (GET /api/netease/public).
 * Fallback for when the weapi channel is risk-controlled (-462). The risk
 * control on datacenter IPs is probabilistic - netease returns -462 for a
 * fraction of requests - so relay with a small retry budget. Mirrors
 * handleNeteasePublic in server/auroraApi.ts and functions/api/netease/public.ts.
 */
function neteasePublicProxy(): Plugin {
  return {
    name: 'aurora-netease-public-proxy',
    configureServer(server) {
      server.middlewares.use('/api/netease/public', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const path = parsed.searchParams.get('path') ?? '';
        const allowed = new Set(['/api/playlist/detail']);
        if (!allowed.has(path)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'path not allowed' }));
          return;
        }
        try {
          let text = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            const upstream = await fetch('https://music.163.com' + path + '?' + parsed.searchParams.toString(), {
              headers: {
                'User-Agent': PC_USER_AGENT,
                Referer: 'https://music.163.com',
                Cookie: 'os=pc; appver=2.9.7; mode=31',
              },
            });
            text = await upstream.text();
            let code: number | undefined;
            try { code = JSON.parse(text).code; } catch { /* non-json */ }
            // -462/-460/512 = probabilistic risk control; a retry usually passes.
            if (upstream.ok && code !== -462 && code !== -460 && code !== 512) break;
            if (attempt < 2) await new Promise((r) => setTimeout(r, 700));
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
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
            const range = req.headers.range;
            const upstream = await fetch(target, {
              headers: {
                'User-Agent': PC_USER_AGENT,
                Referer: new URL(target).origin + '/',
                ...(range ? { Range: range } : {}),
              },
            });
            if (upstream.status !== 206 && !upstream.ok) {
              res.statusCode = upstream.status || 502;
              res.end('upstream error');
              return;
            }
            const body = upstream.body;
            if (!body) {
              res.statusCode = 502;
              res.end('empty upstream body');
              return;
            }
            res.statusCode = upstream.status;
            res.setHeader(
              'Content-Type',
              upstream.headers.get('content-type') ?? 'application/octet-stream',
            );
            const len = upstream.headers.get('content-length');
            if (len) res.setHeader('Content-Length', len);
            res.setHeader('Accept-Ranges', 'bytes');
            const contentRange = upstream.headers.get('content-range');
            if (contentRange) res.setHeader('Content-Range', contentRange);
            res.setHeader('Cache-Control', 'no-store');
            const reader = body.getReader();
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

/** OpenAI-compatible AI pass-through. Credentials stay in the dev server
 * environment and are never accepted from browser requests. */
function aiProxy(env: Record<string, string>): Plugin {
  const endpoint = (env.AURORA_AI_ENDPOINT || AI_DEFAULT_ENDPOINT).replace(/\/$/, '');
  const apiKey = env.AURORA_AI_API_KEY?.trim() ?? '';
  const configuredModel = env.AURORA_AI_MODEL?.trim() || AI_DEFAULT_MODEL;
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
  plugins: [
    react(),
    pwaPlugin(),
    genericProxy(),
    neteaseWeapiProxy(),
    neteasePublicProxy(),
    bilibiliProxy(),
    imageProxy(),
    mediaDownloadProxy(),
    aiProxy(env),
  ],
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
      output: {
        // Split the rarely-changing vendor libraries out of the entry chunk.
        // The first-load byte total is unchanged (the entry still imports
        // them), but a deploy now only invalidates the app chunk instead of
        // forcing every client to re-download React and Supabase. It also
        // keeps each individual chunk under the 500 kB warning threshold.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  };
});
