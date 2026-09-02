/**
 * Traditional -> Simplified conversion for Joox metadata and lyrics.
 * The dictionary chunk is imported lazily: only Joox content pays for it.
 */
type Converter = (text: string) => string;

let converter: Converter | null = null;
let loading: Promise<void> | null = null;

async function ensureConverter(): Promise<void> {
  if (converter) return;
  loading ??= import('opencc-js').then((mod) => {
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