import type { MusicSource } from './types';

const KEY = 'aurora.source-health.v1';
const COOLDOWN_MS = 2 * 60_000;
const FAILURE_DECAY_MS = 15 * 60_000;

interface HealthRecord {
  failures: number;
  lastFailure: number;
  lastSuccess: number;
}

const memory = new Map<MusicSource, HealthRecord>();

function load(): Record<string, HealthRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, HealthRecord>;
  } catch {
    return {};
  }
}

function save(data: Record<string, HealthRecord>): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function sourceHealth(source: MusicSource): HealthRecord {
  const value = memory.get(source) ?? load()[source] ?? { failures: 0, lastFailure: 0, lastSuccess: 0 };
  const now = Date.now();
  const elapsed = now - value.lastFailure;
  if (value.failures > 0 && elapsed > FAILURE_DECAY_MS) {
    value.failures = Math.max(0, value.failures - Math.floor(elapsed / FAILURE_DECAY_MS));
    value.lastFailure = value.failures ? value.lastFailure : 0;
  }
  memory.set(source, value);
  return value;
}

export function markSourceSuccess(source: MusicSource): void {
  const value = { failures: 0, lastFailure: 0, lastSuccess: Date.now() };
  memory.set(source, value);
  const data = load(); data[source] = value; save(data);
}

export function markSourceFailure(source: MusicSource): void {
  const old = sourceHealth(source);
  const value = { failures: old.failures + 1, lastFailure: Date.now(), lastSuccess: old.lastSuccess };
  memory.set(source, value);
  const data = load(); data[source] = value; save(data);
}

export function sourceInCooldown(source: MusicSource): boolean {
  const h = sourceHealth(source);
  return h.lastFailure > 0 && Date.now() - h.lastFailure < COOLDOWN_MS;
}

export function sourcePriority<T extends MusicSource>(sources: T[]): T[] {
  return [...sources].sort((a, b) => {
    const ah = sourceHealth(a); const bh = sourceHealth(b);
    return Number(sourceInCooldown(a)) - Number(sourceInCooldown(b))
      || ah.failures - bh.failures || bh.lastSuccess - ah.lastSuccess;
  });
}
