# Aurora Music Architecture

## Layers

```
Pages ──▶ components ──▶ stores (zustand)
                            │
                            ▼
                      player core (PlayerController)
                            │
                            ▼
                   PlayerEngine / PlayerQueue
                            │
        ┌───────────────────┼─────────────────────┐
        ▼                   ▼                     ▼
 source system        transport             deployed /api
 (music/source)   (lib/apiTransport)   (Vercel api/ · CF functions/)
                              │                     │
                              ▼                     ▼
                     Tauri Rust core        server/auroraApi.ts
                     (plugin-http)          + lib/apiGuard (origin/limit)

AI layer (src/ai/) ──▶ /api/ai pass-through (server-owned key)
                    └─▶ Supabase (accounts, ai_memories, storage)
```

## Player Core (`src/player/`)

- **PlayerState.ts** — snapshot & listener types, repeat modes. Snapshots carry
  `simulated` and `speed` so UI and the OS can render honest progress.
- **PlayerQueue.ts** — pure queue math: load/jump/insert-next/append/next/
  previous/shuffle/remove/move. Shuffle keeps a visited-index history so
  "previous" walks back instead of landing on a random song; history survives
  remove/move via index remapping. Covered by `queue.test.ts`.
- **PlayerEngine.ts** — low-level playback. Starts every song on a simulated
  clock (wall-clock anchored, drift-free in background tabs) and attaches the
  real `<audio>` mid-flight. Stream errors stop the clock instead of faking
  playback; the pending volume is applied whenever the element appears.
- **PlayerController.ts** — the only facade the app uses. Tracks a
  `playbackRequestId` and `source:id:url_id` composite keys to win races
  (skip/pause while a URL is still resolving), persists the whole session
  (queue, index, shuffle, repeat, volume) to `aurora.queue.v1`, and honors the
  quality/autoplay settings from `useSettingsStore`.

UI never touches engine internals; `usePlayerStore` mirrors snapshots.
`hooks/useMediaSession.ts` maps snapshots to lockscreen metadata, media-key
handlers and throttled position state.

## Music Data Layer (`src/music/`)

- **types.ts** — Song / Album / Artist / Playlist / Lyrics / Chart.
- **provider.ts** — `MusicProvider` interface for library browse/detail data.
- **musicService.ts** — the single active-provider binding.
- **mock/** — offline demo data; all names, lyrics and artworks are original.
- **musicStore.ts** — `useProviderData` (with error state + reload) and
  page-oriented hooks.

## Source System (`src/music/source/`, Otter Music style)

Online playback & search are separated from library data:

- **types.ts** — `MusicTrack` (id / name / artist[] / pic_id / url_id /
  lyric_id / source) + `MusicSource` (netease / qq / joox / mock).
- **base-provider.ts** — shared GD-API provider (search / getUrl / getPic /
  getLyric), with per-source subclasses only overriding what differs
  (QQ streams through Joox with a 10-minute URL cache).
- **api-config.ts** — endpoint list with 5-minute failure cooldown, healthy
  endpoints first, read-only ordering; `fetchWithTimeout` merges the caller's
  AbortSignal instead of overwriting it.
- **track-resolver.ts** — TTL-cached stream URL (15 min) / cover (24 h +
  persisted 7-day LRU) resolution with in-flight dedupe and a 999→320→192→128
  quality ladder; failures are cached for only 2 s so retries recover fast.

Playback pipeline: simulated clock for instant UI → `PlayerEngine.attachSource`
mid-flight; exhausted resolution pauses honestly instead of ticking silently.

## Transport & Deployed API

- **src/lib/apiTransport.ts** — runtime branch: plain `fetch` in the browser,
  Tauri `plugin-http` inside the packaged app (absolute URLs required, abort
  semantics normalized).
- **vite.config.ts** — dev-only middlewares under `/api/*` (weapi relay,
  generic proxy, image proxy, media download, AI pass-through).
- **server/auroraApi.ts** — the same five handlers as pure Node functions,
  consumed by thin Vercel wrappers in `api/`.
- **functions/api/** — Cloudflare Pages Functions mirroring the same routes on
  the Workers runtime (`functions/api/_shared.ts`).
- **src/lib/apiGuard.ts** — shared protection for every deployed endpoint:
  same-origin fence (Origin/Referer must match the serving host, a Tauri
  webview, localhost dev, or `AURORA_ALLOWED_ORIGINS`) plus per-IP
  fixed-window rate limits. Requests without origin evidence are rejected, so
  scripts cannot free-ride on the server-owned AI key or the open proxies.
  Isolate-local limits are best-effort; pair with platform rate-limit rules.

## Accounts & Cloud (`supabase/`)

- `functions/account-auth` — username registration (mapped to internal
  emails), strong-password policy (8–64 chars, letters + digits; legacy
  6-digit accounts can still log in), per-IP register throttle.
- Migrations: `listen_rooms`, `avatar_storage`, `ai_memories` (RLS-isolated
  per user).

## AI Layer (`src/ai/`)

- **aiClient.ts** — streaming SSE chat with reasoning-thought support and a
  model fallback ladder (7.5 s per-attempt timeout). In Tauri, Rust owns the
  key and streams deltas over a Channel; on the web the key never leaves the
  server.
- **aiTools.ts** — agent loop tools (search/play/playlist/queue/radio/
  navigate/control/remember/dislike), `::tool` text protocol with
  bracket-balancing JSON repair, route allowlist for navigation, and a
  no-key local rule engine so the feature degrades gracefully.
- **memory.ts** — long-term memories with cloud (Supabase, RLS) + local
  fallback, merge/reinforce/evict logic as pure tested functions, and a
  background extraction pipeline.
- **proactive.ts** — greeting / weekly report / milestone / DJ interlude
  triggers with cooldowns, session bookkeeping and local-template fallback.

## Listen Rooms (`src/listen/`)

Two-seat co-listening on top of the `listen_rooms` table + Supabase Realtime.
The host mirrors player snapshots into the room row (throttled position
writes); the guest plans minimal commands via the pure `listen/sync.ts`
planner (track switch / seek / toggle, drift tolerance 3 s, elapsed time
compensated from `updated_at`). UI lives on the AI page; the bridge hook is
`hooks/useListenRoom.ts`.

## Local Files & Offline Cache (`src/library/`)

- **localLibrary.ts** — user-picked audio files in IndexedDB (meta + blob
  stores), exposed as MusicTracks with source `'local'`; blob URLs stream
  through the normal engine path.
- **offlineCache.ts** — resolved stream bytes cached in IndexedDB (LRU over
  500 MB). `resolveTrackUrl` answers from the cache first, so cached tracks
  play offline and come back as same-origin `blob:` URLs.
- **player/webAudio.ts** — optional analyser + 3-band EQ graph, wired only
  for same-origin/blob sources; remote streams keep the plain element path.

## Library Cloud Sync (`src/sync/`)

`user_library` snapshot table (one row per account, RLS-isolated).
`libraryMerge.ts` is the pure union merge (favorites, recents, play log,
playlists by update_time); `librarySync.ts` pulls-merges-pushes on login and
debounces pushes while stores change. Failure mode: stay local.

## State (`src/store/`)

- `usePlayerStore` — player snapshot mirror + overlay flags.
- `useThemeStore` — light/dark/system with persistence.
- `useLibraryStore` — recent plays, favorites, play log, search history.
- `useSettingsStore` — quality, autoplay-next (both wired into playback).
- `usePlaylistStore` — user playlists; add/remove match on `source:id`.
- `useAiStore` / `useAuthStore` / `useNeteaseAuthStore` / `useExtrasStore`.

## Responsive Strategy

Not a scaled-down desktop page: two distinct shells share components.

- Mobile (< 960px): content + Mini Player + glass Bottom Navigation;
  FullPlayer portrait layout with lyrics page and drag-down dismiss.
- Desktop (≥ 960px): glass Sidebar + content + bottom Mini Player bar;
  FullPlayer split view with visualizer, volume slider and PiP lyrics.
  Layout switches through `useIsDesktop()` (reactive media query).

## Testing

`vitest` (`npm test`) covers the pure cores: weapi crypto, apiTransport
semantics, apiGuard, queue math, sleep fade, daily pick, memory merge,
listening reports, backup round-trip, t2s, image source routing. Keep IO
shells thin and logic pure so this stays true.
