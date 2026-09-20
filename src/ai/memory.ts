import { supabase, supabaseConfigured } from '@/lib/supabase';
import { chatOnce } from './aiClient';
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

/* ---------------- Persistence (cloud with local fallback) ---------------- */

const LOCAL_KEY = 'aurora.ai.memories';

async function hasCloudSession(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

function loadLocal(): AiMemory[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as AiMemory[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLocal(list: AiMemory[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, MEMORY_CAP)));
  } catch {
    /* ignore */
  }
}

/** Cloud memories for the logged-in user; falls back to localStorage. */
export async function loadMemories(): Promise<AiMemory[]> {
  if (await hasCloudSession()) {
    try {
      const { data, error } = await supabase!
        .from('ai_memories')
        .select('id, category, content, weight, last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(MEMORY_CAP);
      if (!error && data) {
        return data.map((row) => ({
          id: String(row.id),
          category: row.category as AiMemoryCategory,
          content: String(row.content),
          weight: Number(row.weight) || 1,
          lastSeenAt: Date.parse(String(row.last_seen_at)) || 0,
        }));
      }
    } catch {
      /* fall through to local */
    }
  }
  return loadLocal();
}

/** Merge ops into storage (cloud when logged in, else local). Never throws. */
export async function upsertMemories(ops: MemoryOp[]): Promise<void> {
  if (!ops.length) return;
  if (await hasCloudSession()) {
    try {
      const current = await loadMemories();
      const { list } = mergeMemories(current, ops, Date.now());
      const existingKeys = new Set(current.map((m) => memKey(m.category, m.content)));
      const fresh = list.filter((m) => !existingKeys.has(memKey(m.category, m.content)));
      const reinforced = current.filter((m) =>
        ops.some((o) => memKey(o.category, o.content) === memKey(m.category, m.content)));
      if (fresh.length) {
        const userId = (await supabase!.auth.getUser()).data.user?.id;
        if (!userId) return;
        await supabase!.from('ai_memories').insert(fresh.map((m) => ({
          user_id: userId,
          category: m.category,
          content: m.content,
          weight: m.weight,
        })));
      }
      for (const m of reinforced) {
        await supabase!
          .from('ai_memories')
          .update({ weight: m.weight + 1, last_seen_at: new Date().toISOString() })
          .eq('id', m.id);
      }
      return;
    } catch {
      /* fall through to local */
    }
  }
  const { list } = mergeMemories(loadLocal(), ops, Date.now());
  saveLocal(list);
}

export async function deleteMemory(id: string): Promise<void> {
  if (await hasCloudSession()) {
    try {
      await supabase!.from('ai_memories').delete().eq('id', id);
    } catch {
      /* ignore */
    }
    return;
  }
  saveLocal(loadLocal().filter((m) => m.id !== id));
}

export async function clearAllMemories(): Promise<void> {
  if (await hasCloudSession()) {
    try {
      await supabase!.from('ai_memories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {
      /* ignore */
    }
    return;
  }
  saveLocal([]);
}

/* ---------------- Channel A: background extraction ---------------- */

const EXTRACTION_SYSTEM =
  '你是记忆提炼器。从对话中提取值得长期记住的信息：用户喜欢的歌手/音乐人（category=artist）、喜欢的风格或语种（genre）、常听的心情场景（mood）、用户主动交代的事实或约定（fact）。' +
  '规则：只提取明确表达过的稳定信息，不要猜测；闲聊寒暄不要记；最多 5 条；每条 content 不超过 50 字，用"喜欢周杰伦"这样的陈述句。' +
  '只输出 JSON 数组，格式 [{"category":"artist","content":"..."}]，没有可记的就输出 []，不要输出任何其他文字。';

/** Channel A: background extraction after a chat turn. Never throws. */
export async function extractMemoryOps(
  turns: AiChatMessage[],
  existing: AiMemory[],
  model: string,
): Promise<MemoryOp[]> {
  if (!turns.length || !model.trim()) return [];
  const known = new Set(existing.map((m) => memKey(m.category, m.content)));
  try {
    const text = await chatOnce(
      { model },
      [
        { role: 'system', content: EXTRACTION_SYSTEM },
        ...turns,
        { role: 'user', content: '（请按系统指令输出 JSON 记忆数组）' },
      ],
    );
    return parseMemoryOps(text).filter((op) => !known.has(memKey(op.category, op.content)));
  } catch {
    return [];
  }
}

/** Convenience wrapper used by AiPage after each agent run. Never throws. */
export async function scheduleMemoryExtraction(turns: AiChatMessage[], model: string): Promise<void> {
  try {
    const existing = await loadMemories();
    const ops = await extractMemoryOps(turns, existing, model);
    if (ops.length) await upsertMemories(ops);
  } catch {
    /* silent */
  }
}

export type { AiChatMessage };
