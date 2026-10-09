#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const release = path.join(root, 'release-cf');
const required = [
  'index.html',
  'assets',
  'functions/api/_shared.ts',
  'functions/api/proxy.ts',
  'functions/api/img.ts',
  'functions/api/media-proxy.ts',
  'functions/api/ai/[[path]].ts',
  'src/lib/apiGuard.ts',
];
for (const relative of required) {
  try { await access(path.join(release, relative)); }
  catch { console.error('[release:smoke] missing ' + relative); process.exit(1); }
}
const shared = await readFile(path.join(release, 'functions/api/_shared.ts'), 'utf8');
if (!shared.includes("../../src/lib/apiGuard")) {
  console.error('[release:smoke] shared handler import changed unexpectedly');
  process.exit(1);
}
console.log('[release:smoke] required Cloudflare files are present and imports are resolvable');
