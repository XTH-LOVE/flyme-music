// Cloudflare Pages Function: GET /api/update/check
//
// The update source for the About screen. The client never talks to GitHub
// directly, for three reasons:
//
//   1. GitHub's API is rate-limited per IP, and an app that phones it on every
//      launch would burn that budget for everyone behind the same NAT.
//   2. api.github.com is unreliable from mainland China, where most of this
//      app's users are.
//   3. A client that parses GitHub's response shape is a client that has to
//      change the day the releases move somewhere else.
//
// So this function is the only thing that knows the releases exist, and the
// response shape below is the contract the client depends on.
//
// Env: GITHUB_REPO ("owner/name", required), GITHUB_TOKEN (optional - needed
// for a private repo, and raises the API limit from 60/h to 5000/h).

import { guard, type Env, type PagesContext } from '../_shared';

interface GithubRelease {
  tag_name?: string;
  body?: string | null;
  published_at?: string;
  prerelease?: boolean;
  assets?: {
    name?: string;
    browser_download_url?: string;
    size?: number;
  }[];
}

/**
 * The payload the About screen renders.
 *
 * Two download URLs on purpose: `downloadUrl` goes through our own proxy for
 * speed in China, `directUrl` is GitHub's own. If the proxy is down the user
 * still has a way to get the file - which is the difference between a slow
 * update and no update.
 */
interface UpdateInfo {
  latestVersion: string;
  changelog: string;
  downloadUrl: string;
  directUrl: string;
  publishDate: string;
  size: number;
  prerelease: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Short and public: the upstream call is cached for ten minutes anyway,
      // and a stale-while-revalidate window keeps a burst of app launches from
      // all reaching the origin.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env as Env, 'update');
  if (blocked) return blocked;

  const repo = context.env.GITHUB_REPO;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    // A misconfiguration, not a user error: say so plainly rather than
    // returning an empty update and letting the client think it is up to date.
    return json({ error: 'GITHUB_REPO is not configured' }, 500);
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Flyme-Music-App',
    Accept: 'application/vnd.github.v3+json',
  };
  if (context.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + context.env.GITHUB_TOKEN;
  }

  try {
    const upstream = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
      headers,
      // Ten minutes of edge cache. GitHub's unauthenticated limit is 60
      // requests an hour *per IP*, and a Pages deployment shares its egress
      // addresses, so without this a modest user base exhausts it.
      cf: { cacheTtl: 600, cacheEverything: true },
    } as RequestInit);

    if (upstream.status === 404) {
      // No release has been published yet. Not an error - a fresh repository
      // should read as "nothing to install", not as a broken check.
      return json({ error: 'no_release' }, 404);
    }
    if (!upstream.ok) {
      return json({ error: 'github_' + upstream.status }, 502);
    }

    const release = (await upstream.json()) as GithubRelease;
    const apk = (release.assets ?? []).find((asset) => (asset.name ?? '').toLowerCase().endsWith('.apk'));

    if (!apk?.browser_download_url) {
      // A release exists but carries no APK - a desktop-only or web-only
      // release. The client shows "no update for this platform" rather than an
      // error, so this is a 404 and not a 500.
      return json({ error: 'no_apk' }, 404);
    }

    const origin = new URL(request.url).origin;
    const info: UpdateInfo = {
      latestVersion: release.tag_name ?? '',
      changelog: (release.body ?? '').trim(),
      downloadUrl:
        origin +
        '/api/update/download?url=' +
        encodeURIComponent(apk.browser_download_url) +
        '&filename=' +
        encodeURIComponent(apk.name ?? 'flyme-music.apk'),
      directUrl: apk.browser_download_url,
      publishDate: release.published_at ?? '',
      size: typeof apk.size === 'number' ? apk.size : 0,
      prerelease: Boolean(release.prerelease),
    };

    return json(info);
  } catch (error) {
    // A network failure to GitHub. Reported as 502 so the client can say
    // "could not check" rather than "you are up to date" - telling someone they
    // are current when the check failed is the one wrong answer here.
    return json({ error: 'upstream_unreachable', detail: String(error).slice(0, 200) }, 502);
  }
}
