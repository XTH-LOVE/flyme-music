// Cloudflare Pages Function: GET /api/update/releases
//
// The landing page's timeline and counters. Same reasoning as the check route:
// the client never talks to GitHub directly, because the API is rate-limited
// per IP, unreliable from mainland China, and its response shape would leak
// into the frontend.
//
// Env: GITHUB_REPO ("owner/name"), GITHUB_TOKEN (optional).

import { guard, type Env, type PagesContext } from '../_shared';

/** How many releases the timeline shows. Enough to read as active, not a dump. */
const RELEASE_COUNT = 12;

interface GithubAsset {
  name?: string;
  size?: number;
  download_count?: number;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string | null;
  published_at?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GithubAsset[];
}

export interface ReleaseSummary {
  version: string;
  title: string;
  date: string;
  prerelease: boolean;
  size: number;
  /** APK downloads, summed across this release's assets. */
  downloads: number;
  notes: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Longer than the check route: the release list changes once per release,
      // and the numbers on it are decorative rather than decisions.
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
    },
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env as Env, 'update');
  if (blocked) return blocked;

  const repo = context.env.GITHUB_REPO;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return json({ error: 'GITHUB_REPO is not configured' }, 500);
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Flyme-Music-App',
    Accept: 'application/vnd.github.v3+json',
  };
  if (context.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + context.env.GITHUB_TOKEN;
  }

  // `cf` is a Cloudflare-specific fetch option that the Workers types do not
  // declare; the cast keeps TypeScript from rejecting it.
  const cached = { headers, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit;

  try {
    const [repoResponse, releasesResponse] = await Promise.all([
      fetch('https://api.github.com/repos/' + repo, cached),
      fetch('https://api.github.com/repos/' + repo + '/releases?per_page=' + RELEASE_COUNT, cached),
    ]);

    if (!repoResponse.ok || !releasesResponse.ok) {
      return json({ error: 'github_' + (repoResponse.status || releasesResponse.status) }, 502);
    }

    const info = (await repoResponse.json()) as { stargazers_count?: number; forks_count?: number };
    const raw = (await releasesResponse.json()) as GithubRelease[];

    let totalDownloads = 0;
    const releases: ReleaseSummary[] = [];

    for (const release of Array.isArray(raw) ? raw : []) {
      // Drafts are not public, and showing one would announce something that
      // does not exist yet.
      if (release.draft) continue;

      const apks = (release.assets ?? []).filter((asset) =>
        (asset.name ?? '').toLowerCase().endsWith('.apk'),
      );
      const downloads = apks.reduce((sum, asset) => sum + (asset.download_count ?? 0), 0);
      totalDownloads += downloads;

      releases.push({
        version: release.tag_name ?? '',
        title: release.name ?? release.tag_name ?? '',
        date: (release.published_at ?? '').slice(0, 10),
        prerelease: Boolean(release.prerelease),
        size: apks.reduce((max, asset) => Math.max(max, asset.size ?? 0), 0),
        downloads,
        // Trimmed because the timeline shows a preview, not the whole note; the
        // download card above already carries the full text for the latest one.
        notes: (release.body ?? '').trim().slice(0, 400),
      });
    }

    return json({
      stars: info.stargazers_count ?? 0,
      forks: info.forks_count ?? 0,
      totalDownloads,
      releases,
    });
  } catch (error) {
    return json({ error: 'upstream_unreachable', detail: String(error).slice(0, 200) }, 502);
  }
}
