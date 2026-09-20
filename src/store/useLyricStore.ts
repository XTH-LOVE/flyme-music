import { create } from 'zustand';

/**
 * Global lyric timing correction.
 *
 * Third-party lyric sheets are frequently off by a second or two - scraped
 * Hi歌 lyrics, Joox's Traditional-Chinese sheets and QQ's LRC all come from
 * different pipelines - and there is no way to fix that at the source. This
 * gives the user one knob: a constant added to every lyric timestamp before it
 * is compared with the playback position.
 *
 * Positive values delay the lyrics (use when the sheet runs ahead of the
 * audio). Applied at every comparison site so highlighting and "tap a line to
 * seek" stay consistent - seeking must land on where the line is actually
 * sung, not on the raw (wrong) timestamp.
 */

const STORAGE_KEY = 'aurora.lyric.offset';
/** Beyond a couple of seconds the sheet is usually just wrong, not shifted. */
const MAX_OFFSET = 10;
const STEP = 0.5;

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(value * 10) / 10));
};

function loadOffset(): number {
  try {
    return clamp(Number(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return 0;
  }
}

interface LyricState {
  /** Seconds added to every lyric timestamp. */
  offset: number;
  setOffset: (value: number) => void;
  /** Step the offset by one notch; `dir` is -1 or 1. */
  nudge: (dir: number) => void;
  reset: () => void;
}

export const LYRIC_OFFSET_STEP = STEP;

export const useLyricStore = create<LyricState>((set, get) => ({
  offset: loadOffset(),

  setOffset: (value) => {
    const offset = clamp(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(offset));
    } catch {
      /* private mode - keep it in memory only */
    }
    set({ offset });
  },

  nudge: (dir) => get().setOffset(get().offset + dir * STEP),

  reset: () => get().setOffset(0),
}));

/** Non-reactive read for code outside React (lyric lookup, AI tools). */
export const lyricOffset = (): number => useLyricStore.getState().offset;
