/**
 * Traditional -> Simplified conversion for Joox metadata and lyrics.
 * The dictionary chunk is imported lazily: only Joox content pays for it.
 *
 * Import the `opencc-js/t2cn` entry point, NOT the bare `opencc-js` one: the
 * default entry bundles every conversion table (full.js, ~1.2 MB raw /
 * ~513 kB gzip), while t2cn.js carries only the traditional->simplified
 * tables we actually use (~109 kB raw, an ~11x reduction).
 */
type Converter = (text: string) => string;

let converter: Converter | null = null;
let loading: Promise<void> | null = null;

async function ensureConverter(): Promise<void> {
  if (converter) return;
  loading ??= import('opencc-js/t2cn').then((mod) => {
    converter = mod.Converter({ from: 'tw', to: 'cn' }) as Converter;
  });
  await loading;
}

export async function toSimplified(text: string): Promise<string> {
  if (!text) return text;
  try {
    await ensureConverter();
  } catch {
    return text;
  }
  return converter ? converter(text) : text;
}