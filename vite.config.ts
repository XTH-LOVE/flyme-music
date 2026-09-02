import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

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

/** Dev-only forwarder: the browser cannot POST to music.163.com (CORS) nor
 * read Set-Cookie. Encryption already happened in src/music/netease/weapi.ts. */
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
            const upstream = await fetch('https://music.163.com' + apiPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': PC_USER_AGENT,
                Referer: 'https://music.163.com',
                Origin: 'https://music.163.com',
                Cookie: typeof cookie === 'string' ? cookie.replace(/[\r\n]/g, '').slice(0, 12000) : '',
              },
              body: form,
            });
            const text = await upstream.text();
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
  plugins: [react(), genericProxy(), neteaseWeapiProxy(), imageProxy(), mediaDownloadProxy(), aiProxy(env)],
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
