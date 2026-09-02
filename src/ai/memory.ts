import type { AiChatMessage } from './aiClient';

export type AiMemoryCategory = 'artist' | 'genre' | 'mood' | 'fact' | 'dislike';

export interface AiMemory {
  id: string;
  category: AiMemoryCategory;
  content: string;
  weight: number;
  lastSeenAt: number;
}

/** A pending entry produced by extraction or the remember tool. */
export interface MemoryOp {
  category: AiMemoryCategory;
  content: string;
}

export const MEMORY_CATEGORIES: AiMemoryCategory[] = ['artist', 'genre', 'mood', 'fact', 'dislike'];
const MEMORY_CAP = 50;

export const isMemoryCategory = (v: unknown): v is AiMemoryCategory =>
  typeof v === 'string' && (MEMORY_CATEGORIES as string[]).includes(v);

function memKey(category: AiMemoryCategory, content: string): string {
  return category + '|' + content.trim();
}

/**
 * Pure merge: reinforce exact (category, trimmed content) duplicates,
 * otherwise add. Keeps at most MEMORY_CAP entries, evicting the lowest
 * weight first, then the oldest.
 */
export function mergeMemories(
  existing: AiMemory[],
  ops: MemoryOp[],
  now: number,
): { list: AiMemory[]; changed: boolean } {
  if (!ops.length) return { list: existing, changed: false };
  const list = existing.map((m) => ({ ...m }));
  let changed = false;
  for (const op of ops) {
    const content = op.content.trim();
    if (!content) continue;
    const hit = list.find((m) => memKey(m.category, m.content) === memKey(op.category, content));
    if (hit) {
      hit.weight += 1;
      hit.lastSeenAt = now;
    } else {
      list.push({
        id: 'm' + now.toString(36) + '-' + list.length,
        category: op.category,
        content,
        weight: 1,
        lastSeenAt: now,
      });
    }
    changed = true;
  }
  if (!changed) return { list: existing, changed: false };
  let out = list;
  if (out.length > MEMORY_CAP) {
    out = [...out]
      .sort((a, b) => a.weight - b.weight || a.lastSeenAt - b.lastSeenAt)
      .slice(out.length - MEMORY_CAP);
  }
  return { list: out, changed: true };
}

const CATEGORY_LABELS: Record<AiMemoryCategory, string> = {
  artist: '喜欢的歌手',
  genre: '喜欢的风格',
  mood: '常听场景',
  fact: '交代过的事',
  dislike: '不喜欢',
};

/** Compact "what I know about you" block for the system prompt ('' when empty). */
export function memoryBlock(memories: AiMemory[]): string {
  const lines: string[] = [];
  for (const cat of MEMORY_CATEGORIES) {
    const items = memories.filter((m) => m.category === cat).map((m) => m.content);
    if (items.length) lines.push(CATEGORY_LABELS[cat] + '：' + items.join('、'));
  }
  return lines.join('\n');
}

/**
 * Parse extraction output into ops. Tolerates fenced/prose-wrapped JSON;
 * drops invalid categories and bad content; returns [] on garbage.
 */
export function parseMemoryOps(text: string): MemoryOp[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ops: MemoryOp[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const { category, content } = item as Record<string, unknown>;
    if (!isMemoryCategory(category)) continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 200) continue;
    ops.push({ category, content: trimmed });
  }
  return ops;
}

export type { AiChatMessage };
