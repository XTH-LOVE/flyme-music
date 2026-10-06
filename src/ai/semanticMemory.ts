import type { AiMemory } from './memory';

export type EpisodicRole = 'user' | 'assistant' | 'tool';

export interface EpisodicMemory {
  id: string;
  role: EpisodicRole;
  content: string;
  createdAt: number;
}

export interface SemanticFact {
  id: string;
  category: string;
  content: string;
  weight: number;
  lastSeenAt: number;
}

const EPISODIC_KEY = 'aurora.ai.episodic.v1';
const SEMANTIC_KEY = 'aurora.ai.semantic.v1';
const MAX_EPISODIC = 200;
const MAX_SEMANTIC = 80;

function read<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    return value ?? fallback;
  } catch { return fallback; }
}

function write<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ }
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[\s,，。！？!?、:：;；/]+/).map((item) => item.trim()).filter((item) => item.length > 1);
}

function lexicalScore(query: string, text: string): number {
  const target = new Set(tokens(text));
  return tokens(query).reduce((score, token) => score + (target.has(token) ? 1 : 0), 0);
}

export function loadEpisodic(): EpisodicMemory[] { return read<EpisodicMemory[]>(EPISODIC_KEY, []); }
export function loadSemantic(): SemanticFact[] { return read<SemanticFact[]>(SEMANTIC_KEY, []); }

export function appendEpisodic(entries: Array<{ role: EpisodicRole; content: string }>): void {
  const now = Date.now();
  const current = loadEpisodic();
  const next = [...current, ...entries.filter((entry) => entry.content.trim()).map((entry, index) => ({ id: `e${now.toString(36)}-${index}`, role: entry.role, content: entry.content.trim().slice(0, 2000), createdAt: now }))];
  write(EPISODIC_KEY, next.slice(-MAX_EPISODIC));
}

export function upsertSemantic(facts: Array<{ category: string; content: string }>): void {
  const now = Date.now();
  const current = loadSemantic().map((fact) => ({ ...fact }));
  for (const fact of facts) {
    const content = fact.content.trim();
    if (!content) continue;
    const hit = current.find((item) => item.category === fact.category && item.content.toLowerCase() === content.toLowerCase());
    if (hit) { hit.weight += 1; hit.lastSeenAt = now; }
    else current.push({ id: `s${now.toString(36)}-${current.length}`, category: fact.category, content: content.slice(0, 240), weight: 1, lastSeenAt: now });
  }
  current.sort((a, b) => b.weight - a.weight || b.lastSeenAt - a.lastSeenAt);
  write(SEMANTIC_KEY, current.slice(0, MAX_SEMANTIC));
}

export function retrieveMemory(query: string, limit = 5): { episodic: EpisodicMemory[]; semantic: SemanticFact[] } {
  const episodic = loadEpisodic().map((item) => ({ item, score: lexicalScore(query, item.content) })).sort((a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt).slice(0, limit).map((item) => item.item);
  const semantic = loadSemantic().map((item) => ({ item, score: lexicalScore(query, item.content) + item.weight * 0.05 })).sort((a, b) => b.score - a.score || b.item.lastSeenAt - a.item.lastSeenAt).slice(0, limit).map((item) => item.item);
  return { episodic, semantic };
}

export function semanticContext(query: string, existing: AiMemory[] = []): string {
  const retrieved = retrieveMemory(query);
  const known = existing.map((item) => item.content);
  const facts = [...retrieved.semantic.map((item) => item.content), ...known].filter((item, index, list) => item && list.indexOf(item) === index);
  const episodes = retrieved.episodic.map((item) => `[${item.role}] ${item.content}`);
  return [...(facts.length ? [`长期偏好：${facts.join('；')}`] : []), ...(episodes.length ? [`相关经历：${episodes.join('；')}`] : [])].join('\n');
}

