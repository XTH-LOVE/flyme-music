/**
 * Bundles the built landing page into one self-contained HTML file.
 *
 * Why this exists: the landing page fetches /api/update/check to fill in its
 * download links, which is right for the deployed site and impossible for a file
 * someone opens from their disk - there, the relative URL resolves to
 * file:///api/... and fails. The page's own error path then removes the download
 * button, so a standalone copy looks like it simply does not have one.
 *
 * So the response is baked in and fetch is stubbed for that one URL. Everything
 * else about the page is untouched, including the code path that fills the
 * links - it runs exactly as it does on the site, it just gets its answer from
 * the file instead of the network.
 *
 * Usage: node scripts/make-standalone-official.mjs [output]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const OUT = process.argv[2] ?? 'flyme-music-official.html';

const htmlPath = join(DIST, 'official.html');
if (!existsSync(htmlPath)) {
  console.error('先跑 npm run build —— 找不到 ' + htmlPath);
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');

/** Inline a built asset, returning '' when it is missing. */
function inline(relPath) {
  const path = join(DIST, relPath.replace(/^\//, ''));
  if (!existsSync(path)) {
    console.warn('  跳过（不存在）:', relPath);
    return '';
  }
  const body = readFileSync(path, 'utf8');
  console.log('  内联', relPath, '(' + Math.round(body.length / 1024) + 'KB)');
  return body;
}

// ---- CSS ----
let css = '';
for (const m of html.matchAll(/<link[^>]+href="(\/assets\/[^"]+\.css)"[^>]*>/g)) {
  css += '\n/* ' + m[1] + ' */\n' + inline(m[1]);
  html = html.replace(m[0], '');
}
// The preloads point at files that no longer exist as separate requests.
html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');

// ---- JS ----
// Collected before rewriting, because each replacement changes the string the
// next match is looking for.
const scripts = [...html.matchAll(/<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]*><\/script>/g)];
let js = '';
for (const m of scripts) {
  js += '\n/* ' + m[1] + ' */\n' + inline(m[1]);
  html = html.replace(m[0], '');
}
// The service worker registers paths that only exist on the deployed origin.
html = html.replace(/<script[^>]+src="\/registerSW\.js"[^>]*><\/script>/g, '');

// ---- Make the rest of the page work from a file ----

/*
 * The logo, as a data URI.
 *
 * A file:// page resolving /flyme-mark.jpg asks the filesystem root for it, so
 * the mark would be a broken image on the one page whose job is to look
 * presentable.
 */
const MARK = 'public/flyme-mark.jpg';
if (existsSync(MARK)) {
  const b64 = readFileSync(MARK).toString('base64');
  const dataUri = 'data:image/jpeg;base64,' + b64;
  html = html.replaceAll('"/flyme-mark.jpg"', '"' + dataUri + '"');
  console.log('  内联 flyme-mark.jpg (' + Math.round(b64.length / 1365) + 'KB)');
} else {
  console.warn('  找不到 ' + MARK + ' —— 图标会是空白');
}

// A manifest is a PWA concept and points at paths that do not exist here.
html = html.replace(/<link[^>]+rel="manifest"[^>]*>/g, '');

/*
 * Links back to the site.
 *
 * `href="/"` means the site root on the deployed origin and the filesystem root
 * in a file. Everything relative is pointed at the live site instead, so the nav
 * still goes somewhere.
 */
html = html.replace(/(href|src)="\//g, '$1="https://flyme-music.pages.dev/');

if (!js) {
  console.error('没有内联到任何脚本 —— 页面会是空壳，中止');
  process.exit(1);
}

// ---- The download data, fetched now and frozen into the file ----
const api = 'https://flyme-music.pages.dev/api/update/check';
const response = await fetch(api, {
  headers: { Accept: 'application/json', Origin: 'https://flyme-music.pages.dev' },
});
if (!response.ok) {
  console.error('拿不到更新信息：HTTP ' + response.status);
  process.exit(1);
}
const info = await response.json();
if (!info?.latestVersion) {
  console.error('更新信息里没有版本号，拒绝写一个空的下载区');
  process.exit(1);
}
console.log('  已冻结版本:', info.latestVersion);

/*
 * Runs before the page's own script, and answers only the one URL.
 *
 * A Response is constructed rather than an object literal because the page
 * calls .ok and .json() on it; anything less would take the error path and the
 * download button would disappear again, which is the bug this is here to fix.
 */
const stub = `<script>
/* Frozen at build time. The page asks for this on the deployed origin; from a
   file it cannot, so the answer is already here. */
(function () {
  var baked = ${JSON.stringify(info)};
  var real = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/update/check') !== -1) {
      return Promise.resolve(new Response(JSON.stringify(baked), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return real ? real(input, init) : Promise.reject(new Error('offline'));
  };
})();
</script>`;

// ---- Assemble ----
html = html.replace('</head>', '<style>\n' + css + '\n</style>\n</head>');
html = html.replace('</body>', stub + '\n<script type="module">\n' + js + '\n</script>\n</body>');

writeFileSync(OUT, html, 'utf8');
const kb = Math.round(html.length / 1024);
console.log('\n已写出 ' + OUT + '（' + kb + 'KB，单文件，离线可用）');
console.log('下载链接：');
console.log('  国内加速:', info.downloadUrl);
console.log('  直连:    ', info.directUrl);
