export interface DeferredAiMessage {
  id: string;
  message: string;
  trigger: string;
  fireAt: number;
  createdAt: number;
}

const KEY = 'aurora.ai.deferred.v1';

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-z_][\w-]*)\s*=\s*("[\s\S]*?"|'[\s\S]*?')/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attributes[match[1].toLowerCase()] = decodeAttribute(match[2].slice(1, -1));
  }
  return attributes;
}

function load(): DeferredAiMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is DeferredAiMessage => Boolean(item && typeof item === 'object' && typeof (item as DeferredAiMessage).message === 'string')) : [];
  } catch {
    return [];
  }
}

function save(items: DeferredAiMessage[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-100))); } catch { /* optional */ }
}

export function parseDeferTag(text: string): { clean: string; message: string; afterMinutes: number; trigger: string } | null {
  const jsonMatch = text.match(/<defer>\s*(\{[\s\S]*?\})\s*<\/defer>/i);
  const attributeMatch = text.match(/<defer\b([^>]*)\/\s*>/i);
  const match = jsonMatch ?? attributeMatch;
  if (!match) return null;

  try {
    const value = jsonMatch
      ? JSON.parse(jsonMatch[1]) as Record<string, unknown>
      : parseAttributes(attributeMatch![1]);
    const message = typeof value.message === 'string' ? value.message.trim() : '';
    if (!message) return null;
    const afterMinutes = Math.max(0, Math.min(43_200, Number(value.after_minutes) || 0));
    const trigger = typeof value.trigger === 'string' && value.trigger.trim() ? value.trigger.trim().slice(0, 80) : 'follow_up';
    return { clean: text.replace(match[0], '').trim(), message, afterMinutes, trigger };
  } catch {
    return null;
  }
}

/** Remove defer markup from text shown while a model response is streaming. */
export function stripDeferSyntax(text: string): string {
  return text
    .replace(/<defer>\s*\{[\s\S]*?\}\s*<\/defer>/gi, '')
    .replace(/<defer\b[^>]*\/\s*>/gi, '')
    .trim();
}

export function scheduleDeferred(message: string, afterMinutes: number, trigger = 'follow_up', now = Date.now()): DeferredAiMessage {
  const item: DeferredAiMessage = { id: `d${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, message: message.trim(), trigger, fireAt: now + Math.max(0, afterMinutes) * 60_000, createdAt: now };
  const items = load().filter((existing) => !(existing.message === item.message && existing.trigger === item.trigger));
  items.push(item);
  save(items);
  return item;
}

export function listDeferred(now = Date.now()): DeferredAiMessage[] {
  return load().filter((item) => item.fireAt >= now).sort((a, b) => a.fireAt - b.fireAt);
}

export function flushDeferred(now = Date.now()): DeferredAiMessage[] {
  const items = load();
  const due = items.filter((item) => item.fireAt <= now);
  save(items.filter((item) => item.fireAt > now));
  return due;
}

export function cancelDeferred(id: string): boolean {
  const items = load();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  save(next);
  return true;
}
