# Flyme Music Design System

HyperOS-inspired design language: soft, rounded, clean, immersive, light.
Only the design *language* of HyperOS / Miuix / HiUI is referenced —
no Xiaomi code, logos or copyrighted assets are copied.

## Color

| Token | Light | Dark |
| --- | --- | --- |
| Background | #F5F5F7 | #101012 |
| Surface | #FFFFFF | #18181B |
| Secondary Surface | #F0F0F2 | #222225 |
| Text Primary | #111111 | #FFFFFF |
| Text Secondary | #777777 | #A0A0A5 |
| Accent | #3D7BFF | #5B8CFF |

The Full Player additionally generates an **ambient background** from the
album palette (`src/utils/color.ts`: darken + radial glow), so color is
never fully static.

Runtime variables live in `src/styles/global.css` under `:root` and
`[data-theme='dark']`; TS mirrors them in `src/design-system/*.ts`.

## Radius

Unified tokens only — no ad-hoc values:

| Token | Value | Usage |
| --- | --- | --- |
| sm | 12px | small controls, covers in lists |
| md | 16px | buttons, nav pills |
| lg | 20px | cards, mini player |
| xl | 24px | large cards, dialogs |
| xxl | 28px | sheets |
| cover | 32px | hero covers, full player |
| pill | 999px | chips, switches |

## Shadows

Restrained elevation: `card`, `card-hover`, `floating`, `glass`.
Dark mode swaps to deeper variants automatically via CSS variables.

## Glass / Blur

`backdrop-filter: blur(24~28px) saturate(1.4~1.5)` is applied **only** to:

- Mini Player
- Bottom Navigation
- Desktop Sidebar
- Bottom Sheet

Glass must stay scarce — most surfaces are solid.

## Motion

| Token | Duration | Usage |
| --- | --- | --- |
| micro | 120ms | pressed states, icons |
| normal | 200ms | hover, toggles |
| page | 280ms | page enter, theme swap |
| sheet | 350ms | sheets, full player |

Easings: standard `cubic-bezier(0.2,0,0,1)` and spring
`cubic-bezier(0.34,1.4,0.64,1)`.

Signature interactions:

- play button press → `scale(0.96)`
- song switch → cover crossfade / spring-in (`fp-cover-in`)
- Mini → Full player → slide-up + scale overlay (shared-element feel)
- playing song → equalizer badge in lists

## Typography

MiSans-first stack with PingFang SC / Segoe UI fallbacks.
Display 28 / Title 24 / Section 19 / Body 15 / Caption 12.

## Dark Mode

Supported from day one via `data-theme` attribute.
Three user modes: Light / Dark / System (persisted in localStorage,
OS preference tracked live). Every component ships all interactive states:
hover / active / disabled.
