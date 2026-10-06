import { describe, expect, it } from 'vitest';
import { parseNormalizedToolCalls, validateToolArguments } from './toolProtocol';

describe('tool protocol', () => {
  it('parses legacy and native envelopes', () => {
    expect(parseNormalizedToolCalls('::tool {"tool":"search_tracks","query":"爵士"}')[0].tool).toBe('search_tracks');
    expect(parseNormalizedToolCalls('{"tool_calls":[{"function":{"name":"control","arguments":"{\\"action\\":\\"next\\"}"}}]}')[0].arguments.action).toBe('next');
  });

  it('validates required arguments', () => {
    const call = parseNormalizedToolCalls('{"name":"navigate","arguments":{}}')[0];
    expect(validateToolArguments(call).ok).toBe(false);
  });
});

