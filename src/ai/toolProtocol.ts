import type { ToolResult } from './aiTools';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface NormalizedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  raw: Record<string, unknown>;
}

const OBJECT = { type: 'object', additionalProperties: true } as const;

/** A small, provider-neutral catalog. The legacy ::tool protocol remains supported. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: 'play_music', description: 'Plan, retrieve, personalize, verify, and play music from one natural-language request.', parameters: { ...OBJECT, properties: { request: { type: 'string' }, mood: { type: 'string' }, duration: { type: 'number' }, avoid: { type: 'array', items: { type: 'string' } }, max_artist_repeat: { type: 'number' }, count: { type: 'number' } }, required: ['request'] } },
  { name: 'search_tracks', description: 'Search songs across configured music sources.', parameters: { ...OBJECT, properties: { query: { type: 'string' }, count: { type: 'number' }, artist: { type: 'string' } }, required: ['query'] } },
  { name: 'play', description: 'Play one or more tracks from the current candidate pool.', parameters: { ...OBJECT, properties: { indices: { type: 'array', items: { type: 'number' } }, query: { type: 'string' } } } },
  { name: 'create_playlist', description: 'Create a playlist from a theme or candidate tracks.', parameters: { ...OBJECT, properties: { title: { type: 'string' }, query: { type: 'string' }, count: { type: 'number' } } } },
  { name: 'control', description: 'Control playback.', parameters: { ...OBJECT, properties: { action: { type: 'string' }, seconds: { type: 'number' }, value: { type: 'number' } }, required: ['action'] } },
  { name: 'radio', description: 'Start a mood radio session.', parameters: { ...OBJECT, properties: { mood: { type: 'string' } }, required: ['mood'] } },
  { name: 'plan_playlist', description: 'Plan a multi-stage playlist from a natural-language request.', parameters: { ...OBJECT, properties: { request: { type: 'string' }, query: { type: 'string' } }, required: ['request'] } },
  { name: 'pick_next', description: 'Pick the next track from the verified candidate pool.', parameters: { ...OBJECT, properties: { stage: { type: 'string' } } } },
  { name: 'queue_similar', description: 'Find and queue similar tracks.', parameters: OBJECT },
  { name: 'find_similar_by_sound', description: 'Find tracks with similar measured sound.', parameters: OBJECT },
  { name: 'analyze_song', description: 'Measure the currently playing song.', parameters: OBJECT },
  { name: 'remember', description: 'Remember a stable user preference or fact.', parameters: { ...OBJECT, properties: { category: { type: 'string' }, content: { type: 'string' } }, required: ['content'] } },
  { name: 'dislike', description: 'Avoid an artist, genre, or keyword in future searches.', parameters: { ...OBJECT, properties: { word: { type: 'string' } }, required: ['word'] } },
  { name: 'navigate', description: 'Navigate to an allowed application route.', parameters: { ...OBJECT, properties: { to: { type: 'string' } }, required: ['to'] } },
  { name: 'get_app_state', description: 'Read current application and player state.', parameters: OBJECT },
  { name: 'queue_state', description: 'Read the current queue.', parameters: OBJECT },
  { name: 'library_stats', description: 'Read listening statistics.', parameters: OBJECT },
  { name: 'report', description: 'Create a listening report.', parameters: OBJECT },
];

function balancedJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote) { escaped = true; continue; }
    if (ch === '"') { quote = !quote; continue; }
    if (quote) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalize(raw: Record<string, unknown>): NormalizedToolCall | null {
  const tool = typeof raw.tool === 'string' ? raw.tool : typeof raw.name === 'string' ? raw.name : '';
  if (!tool) return null;
  const candidate = raw.arguments ?? raw.args ?? raw.parameters;
  let args: Record<string, unknown> = {};
  if (typeof candidate === 'string') args = asRecord(balancedJson(candidate)) ?? {};
  else if (asRecord(candidate)) args = asRecord(candidate) ?? {};
  else args = { ...raw };
  delete args.tool;
  delete args.name;
  return { tool, arguments: args, raw };
}

/** Parse native tool-call JSON, OpenAI-compatible envelopes, or legacy ::tool output. */
export function parseNormalizedToolCalls(text: string): NormalizedToolCall[] {
  const calls: NormalizedToolCall[] = [];
  const candidates: unknown[] = [];
  const direct = asRecord(balancedJson(text));
  if (direct) candidates.push(direct);
  for (const match of text.matchAll(/::tool\s*(\{[\s\S]*?\})/g)) {
    const obj = asRecord(balancedJson(match[1]));
    if (obj) candidates.push(obj);
  }
  for (const match of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) {
    const obj = asRecord(balancedJson(match[1]));
    if (obj) candidates.push(obj);
  }
  // Some local models omit the protocol marker and emit `tool_name {}`.
  // Accept that form too, but only for names from our allow-listed catalog.
  for (const definition of TOOL_DEFINITIONS) {
    const escaped = definition.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|\\s)${escaped}\\s*(\\{[\\s\\S]*?\\})`, 'g');
    for (const match of text.matchAll(pattern)) {
      const obj = asRecord(balancedJson(match[1]));
      if (obj) candidates.push({ tool: definition.name, ...obj });
    }
  }
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    const list = Array.isArray(record.tool_calls) ? record.tool_calls : [record];
    for (const item of list) {
      const outer = asRecord(item);
      const fn = outer && asRecord(outer.function);
      const call = normalize(fn ?? outer ?? {});
      if (call && !calls.some((existing) => existing.tool === call.tool && JSON.stringify(existing.arguments) === JSON.stringify(call.arguments))) calls.push(call);
    }
  }
  return calls;
}

export function stripToolSyntax(text: string): string {
  let clean = text
    .replace(/::tool\s*\{[\s\S]*?\}/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  for (const definition of TOOL_DEFINITIONS) {
    const escaped = definition.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`(?:^|\\s)${escaped}\\s*\\{[\\s\\S]*?\\}`, 'g'), ' ');
  }
  return clean.trim();
}

export function callsToLegacy(calls: NormalizedToolCall[]): Record<string, unknown>[] {
  return calls.map((call) => ({ tool: call.tool, ...call.arguments }));
}

export function validateToolArguments(call: NormalizedToolCall): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const definition = TOOL_DEFINITIONS.find((item) => item.name === call.tool);
  if (!definition) return { ok: false, error: `未知工具：${call.tool}` };
  const required = Array.isArray(definition.parameters.required) ? definition.parameters.required as unknown[] : [];
  for (const key of required) {
    if (typeof key === 'string' && (call.arguments[key] === undefined || call.arguments[key] === null)) return { ok: false, error: `缺少参数：${key}` };
  }
  return { ok: true, value: call.arguments };
}

export function toolResultMessage(result: ToolResult): string {
  return JSON.stringify({ reply: result.reply, fact: result.fact ?? null, tracks: result.tracks?.map((track) => ({ id: track.id, source: track.source, name: track.name, artist: track.artist })) ?? [] });
}
