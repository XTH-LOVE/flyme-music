import { describe, expect, it } from 'vitest';
import { LOW_CORE_COUNT, LOW_MEMORY_GB, classifyDevice } from './deviceTier';

describe('classifyDevice', () => {
  it('calls a well-specced device high-end', () => {
    expect(classifyDevice({ cores: 8, memory: 8 })).toBe('high');
    expect(classifyDevice({ cores: 16, memory: 32 })).toBe('high');
  });

  it('calls a weak device low-end', () => {
    expect(classifyDevice({ cores: 2, memory: 8 })).toBe('low');
    expect(classifyDevice({ cores: 8, memory: 2 })).toBe('low');
  });

  it('treats the thresholds themselves as high-end', () => {
    expect(classifyDevice({ cores: LOW_CORE_COUNT, memory: LOW_MEMORY_GB })).toBe('high');
  });

  it('treats missing signals as high-end', () => {
    // Safari reports neither, and treating every Safari user as low-end would
    // cost more than the occasional wasted blur.
    expect(classifyDevice({})).toBe('high');
    expect(classifyDevice({ cores: undefined, memory: undefined })).toBe('high');
  });

  it('ignores nonsense readings rather than trusting them', () => {
    expect(classifyDevice({ cores: 0 })).toBe('high');
    expect(classifyDevice({ memory: 0 })).toBe('high');
    expect(classifyDevice({ cores: -4 })).toBe('high');
    expect(classifyDevice({ memory: Number.NaN })).toBe('high');
  });

  it('is low-end if either signal is low', () => {
    expect(classifyDevice({ cores: 2, memory: 64 })).toBe('low');
    expect(classifyDevice({ cores: 64, memory: 1 })).toBe('low');
  });
});
