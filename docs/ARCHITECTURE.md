# Flyme Music Architecture

## Layers

```
Pages ──▶ components ──▶ stores (zustand)
                            │
                            ▼
                      player core (PlayerController)
                            │
                            ▼
                   PlayerEngine / PlayerQueue

Pages ──▶ music hooks (useProviderData...) ──▶ musicService ──▶ MusicProvider
                                                                     │
                                                              MockMusicProvider (phase 1)
```

## Player Core (`src/player/`)

- **PlayerState.ts** — snapshot & listener types, repeat modes.
- **PlayerQueue.ts** — pure queue math: load/jump/next/previous/shuffle bookkeeping.
- **PlayerEngine.ts** — low-level playback. Real `<audio>` when `song.audioUrl`
  exists; otherwise a simulated clock keeps the entire product interactive
  offline (phase 1 ships no licensed audio).
- **PlayerController.ts** — the only facade the app uses:
  play / pause / toggle / next / previous / seek / volume / queue / shuffle / repeat.
  Broadcasts immutable `PlayerSnapshot`s.

UI never touches engine internals; `usePlayerStore` simply mirrors snapshots.

## Music Data Layer (`src/music/`)

- **types.ts** — Song / Album / Artist / Playlist / Lyrics / Chart.
- **provider.ts** — `MusicProvider` interface for library browse/detail data.
- **musicService.ts** — the single active-provider binding.
- **mock/** — offline demo data; all names, lyrics and artworks are original.
- **musicStore.ts** — `useProviderData` + page-oriented hooks.

## Source System (`src/music/source/`, Otter Music style)

Online playback & search are separated from library data:

- **types.ts** — `MusicTrack` (id / name / artist[] / pic_id / url_id / lyric_id
  / source) + `MusicSource`. Only **netease** and **joox** are kept as remote
  sources; `mock` is the local demo library.
- **base-provider.ts** — shared GD-API provider (search / getUrl / getPic /
  getLyric via `api.php?types=...&source=...`).
- **providers/** — `NeteaseProvider` / `JooxProvider` (both extend the base)
  + `MockTrackProvider`.
- **factory.ts** — singleton `MusicProviderFactory.getProvider(source)`.
- **api-config.ts** — endpoint list with 5-minute failure cooldown & ordering
  (healthy endpoints first); custom endpoint configurable in Settings.
- **track-resolver.ts** — TTL-cached stream URL / cover resolution
  (stream keys expire, e.g. Joox vkey).

Playback pipeline: the controller starts a simulated clock for instant UI,
then attaches the resolved stream mid-flight (`PlayerEngine.attachSource`);
stream errors degrade back to simulation automatically.

## User Playlists (`src/store/usePlaylistStore.ts`)

Ported from Otter's playlist slice: create / rename / delete / add / batch /
remove / reorder, persisted to localStorage. Tracks from any source can be
stored (`source:id` identity); UI: Library → 我的歌单, 添加到歌单 sheet,
`/my-playlist/:id` detail page.

## State (`src/store/`)

- `usePlayerStore` — player snapshot mirror + overlay flags.
- `useThemeStore` — light/dark/system with persistence.
- `useLibraryStore` — recent plays, favorites, search history (persisted).
- `useSettingsStore` — quality, autoplay, download preferences.

## Responsive Strategy

Not a scaled-down desktop page: two distinct shells share components.

- Mobile (< 960px): content + Mini Player + glass Bottom Navigation.
- Desktop (≥ 960px): glass Sidebar + content + bottom Mini Player bar;
  BottomSheet becomes a centered dialog.

## Cover Art

`Cover` renders layered CSS gradients from an entity's `palette` token —
zero network dependency, zero copyright risk, and every entity carries its
own art direction.
