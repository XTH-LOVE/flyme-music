# Aurora Music Roadmap

## Phase 1 — Foundation (done)

- Project scaffold (Vite + React + TS)
- Design system: tokens, theme variables, dark mode
- Base components: buttons, chips, cards, search bar, sheet, dialog, slider
- App shells: mobile bottom nav, desktop sidebar, mini player
- Pages: Home / Library / Discover / Search / details / Settings / Me
- Player core + Full Player + lyrics + queue
- Offline mock provider with original content

## Phase 2 — Real music providers (done)

- Otter-style source system: IMusicProvider base + factory, GD API endpoints
  with failure cooldown, TTL caches for stream URLs / covers
- netease + joox online sources (search / stream / cover / LRC lyrics)
- Simulated-clock-first playback engine with mid-flight stream attach
- User playlists: create / rename / delete / add / remove, persisted

## Phase 2.5 — Provider hardening (mostly done)

- [x] Official netease weapi route (`music/netease/`) incl. QR-code login and
      session-cookie relay through the deployed proxy
- [x] QQ module (`music/qq/`) with Referer-aware proxying (Joox-backed streams)
- [x] CORS proxies moved server-side (dev middlewares + deployed endpoints)
- [x] Local file provider (scan/import user audio, IndexedDB metadata) —
      see the Phase 4 local-music entry below

## Phase 3 — Experience depth (done)

- [x] Canvas-based ambient color extraction for covers (`coverPalette.ts`)
- [x] Real FFT spectrum + 3-band EQ via Web Audio (`player/webAudio.ts`),
      wired only for same-origin/blob sources (cross-origin stays untainted)
- [x] Audio visualizer, sleep timer with volume fade (`sleepFade.ts`),
      playback speed, PiP lyrics, lyric share cards, immersive cover mode
- [x] MediaSession integration (lockscreen art, media keys, seek)
- [x] OS "now playing" notification while backgrounded (opt-in)
- [x] Voice input on the AI page (Web Speech API, feature-detected)
- [x] AI DJ interludes every 5 session tracks (`proactive.ts`)
- [x] Generative playlist covers (`playlistArt.ts`)
- [ ] True shared-element transition (View Transitions API)
- [ ] Gapless playback

## Phase 4 — Productization (in progress, Tauri instead of PWA)

- [x] Tauri packaging: Windows (NSIS) + Android; Rust-owned AI key and
      CORS-free networking via plugin-http (`lib/apiTransport.ts`)
- [x] Desktop integration: tray icon with close-to-tray, global media
      shortcuts (Rust event bridge in `lib/globalMediaKeys.ts`)
- [x] Deployed backend: Vercel (`api/`) + Cloudflare Pages (`functions/`)
      sharing pure handlers (`server/auroraApi.ts`), same-origin guard +
      per-IP rate limits (`src/lib/apiGuard.ts`)
- [x] Supabase accounts (username login via `account-auth` edge function,
      strong-password policy), avatar storage
- [x] AI long-term memories synced per-account (RLS-isolated `ai_memories`)
- [x] Library cloud sync across devices (RLS-isolated `user_library`
      snapshot + pure merge in `sync/libraryMerge.ts`)
- [x] Listen rooms: create/join by 6-char code, host mirrors the player
      snapshot, guest follows via realtime (Supabase Realtime +
      `listen/listenRoom.ts`, pure calibration in `listen/sync.ts`)
- [x] Local music library: user audio files in IndexedDB exposed as the
      `local` music source (`library/localLibrary.ts`), mixed into the
      online queue
- [x] Offline audio cache (IndexedDB, LRU over 500 MB) with a track action
      + management on the local-music page (`library/offlineCache.ts`)
- [x] Netease playlist import + subscribe, surfaced on the playlist square
- [x] Backup export/import (`utils/backup.ts`), listening reports, daily pick
- [x] CI (tsc + vitest + build on push/PR)
- [ ] PWA install + offline cache (web build)
- [ ] i18n (zh-CN / en)

## Phase 5 — Hardening backlog

- Platform-level rate limiting rules (Cloudflare/Vercel) alongside the
  in-isolate limiter
- [x] Long-list virtualization beyond `content-visibility` for 300+ track pages
      — `components/ProgressiveList.tsx` renders 60 rows, then 60 more as a
      sentinel comes into view; `content-visibility` only skipped painting, so
      a 1000-track playlist still mounted 1000 rows in one commit
- CSS consolidation: retire the `ui-refresh` / `monet` / `cover-fix` patch
  layers, single source of truth for design tokens
- Netease session cookie: encrypted storage or OS keychain via Tauri
