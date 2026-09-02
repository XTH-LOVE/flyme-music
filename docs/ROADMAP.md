# Flyme Music Roadmap

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

## Phase 2.5 — Provider hardening

- Local file provider (scan/import user audio, IndexedDB metadata)
- Official netease API route for copyright-locked tracks
- Optional local CORS proxy for unstable third-party API nodes

## Phase 3 — Experience depth

- True shared-element transition (View Transitions API)
- Canvas-based ambient color extraction for imported covers
- Audio visualizer & gapless playback
- Sleep timer, playback speed, EQ presets

## Phase 4 — Productization

- PWA install + offline cache
- Playlists editing (create/reorder)
- Sync library across devices
- i18n (zh-CN / en)
