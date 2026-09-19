#!/usr/bin/env node
/**
 * Assemble the Cloudflare Pages drag-and-drop upload bundle (release-cf/).
 *
 * Why this script exists
 * ---------------------
 * The bundle needs THREE inputs, not two. `functions/api/_shared.ts` does:
 *
 *     import { isAllowedRequest, rateLimit, ... } from '../../src/lib/apiGuard';
 *
 * Cloudflare resolves that at build time, so the upload must contain
 * `src/lib/apiGuard.ts` next to `functions/`. Copying only `dist` + `functions`
 * (as the README used to instruct) produces a bundle that fails to deploy with
 * an unresolved-import error.
 *
 * It also refuses to run against a stale `dist/`, which was the other way this
 * bundle went wrong: dragging an old build to Cloudflare silently ships an
 * outdated backend.
 *
 * Usage:
 *   npm run release:cf              # writes ./release-cf
 *   node scripts/make-cf-release.mjs <outDir>   # custom output
 */
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = path.join(root, 'dist');
const functionsDir = path.join(root, 'functions');
const outDir = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, 'release-cf');

/**
 * Files that never reach the bundle and so must not affect the staleness check.
 * Without this, editing a test would demand a full rebuild before deploying.
 */
const IGNORED = /\.test\.[cm]?[jt]sx?$/;

/** Newest mtime under a path, or 0 when it does not exist. */
async function newestMtime(target) {
  let newest = 0;
  const info = await stat(target).catch(() => null);
  if (!info) return newest;
  if (info.isFile()) return IGNORED.test(target) ? 0 : info.mtimeMs;
  if (!info.isDirectory()) return newest;
  for (const entry of await readdir(target)) {
    newest = Math.max(newest, await newestMtime(path.join(target, entry)));
  }
  return newest;
}

function fail(message) {
  console.error('[release:cf] ' + message);
  process.exit(1);
}

/**
 * Resolve an extensionless relative import the way the bundler will.
 * Cloudflare accepts `'../../src/lib/apiGuard'` without the extension.
 */
function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every relative import under `functions/` that reaches outside it.
 *
 * Hardcoding this list is what broke the deploy when a second shared module was
 * added, so it is discovered instead.
 */
async function collectExternalImports(dir, found = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectExternalImports(full, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const source = await readFile(full, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = resolveImport(full, match[1]);
      if (!resolved) {
        fail(
          path.relative(root, full) + ' imports ' + match[1] + ' which does not resolve. ' +
            'The deployed bundle would fail the same way.',
        );
      }
      if (!resolved.startsWith(functionsDir + path.sep)) {
        found.set(resolved, path.relative(root, full));
      }
    }
  }
  return found;
}

if (!existsSync(path.join(distDir, 'index.html'))) {
  fail('dist/index.html is missing - run `npm run build` first.');
}

const externalImports = await collectExternalImports(functionsDir);

const [distTime, srcTime, functionsTime] = await Promise.all([
  newestMtime(distDir),
  newestMtime(path.join(root, 'src')),
  newestMtime(functionsDir),
]);
if (srcTime > distTime || functionsTime > distTime) {
  fail('dist/ is older than src/ or functions/ - run `npm run build` again.');
}

await rm(outDir, { recursive: true, force: true });
await cp(distDir, outDir, { recursive: true });
await cp(functionsDir, path.join(outDir, 'functions'), { recursive: true });

// Shared modules the Functions import, mirrored at the same relative paths so
// the deployed imports resolve exactly as they do in the repository.
for (const [absolute, importedBy] of externalImports) {
  const target = path.join(outDir, path.relative(root, absolute));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(absolute, target);
  console.log('  ' + path.relative(root, absolute) + '  (imported by ' + importedBy + ')');
}

console.log('[release:cf] bundle ready: ' + path.relative(root, outDir));
console.log('  from dist/        -> .');
console.log('  from functions/   -> functions/');
console.log('  ' + externalImports.size + ' shared module(s) copied');
console.log('Next: Cloudflare dashboard -> Workers & Pages -> Create new deployment -> drag this folder.');