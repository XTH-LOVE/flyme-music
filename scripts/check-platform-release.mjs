#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const checks = [
  ['dist/index.html', 'web build'],
  ['src-tauri/tauri.conf.json', 'Tauri config'],
  ['src-tauri/icons/32x32.png', 'Tauri Windows icon'],
  ['src-tauri/icons/128x128.png', 'Tauri Android icon'],
  ['.github/workflows/release-android.yml', 'Android release workflow'],
  ['.github/workflows/ci.yml', 'CI workflow'],
];
for (const [relative, label] of checks) {
  try { await access(path.join(root, relative)); }
  catch { console.error('[platform:smoke] missing ' + label + ': ' + relative); process.exit(1); }
}
const config = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
if (config.build?.frontendDist !== '../dist') throw new Error('Tauri frontendDist must be ../dist');
if (!config.bundle?.targets?.includes('nsis')) throw new Error('Windows NSIS target is not enabled');
if (!config.app?.security?.csp || config.app.security.csp === null) throw new Error('Tauri CSP must be enabled');
const workflow = await readFile(path.join(root, '.github/workflows/release-android.yml'), 'utf8');
for (const token of ['tauri android build', 'dist/android/*.apk']) {
  if (!workflow.includes(token)) throw new Error('Android workflow missing: ' + token);
}
const assets = (await import('node:fs/promises')).readdir(path.join(root, 'dist/assets'));
const js = (await assets).filter((name) => name.endsWith('.js'));
const main = js.find((name) => name.startsWith('main-'));
if (!main) throw new Error('main JS chunk missing');
const bytes = (await (await import('node:fs/promises')).stat(path.join(root, 'dist/assets', main))).size;
if (bytes > 450_000) throw new Error('main JS chunk exceeds 450 KB: ' + bytes);
console.log('[platform:smoke] Web, Tauri, Android workflow, CSP, icons, and bundle budget passed');
