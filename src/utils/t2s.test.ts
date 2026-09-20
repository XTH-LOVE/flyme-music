import { describe, expect, it } from 'vitest';
import { toSimplified } from './t2s';

describe('toSimplified', () => {
  it('把常见繁体词转成简体', async () => {
    expect(await toSimplified('愛情的模樣')).toBe('爱情的模样');
  });

  it('保留数字、标点与英文', async () => {
    expect(await toSimplified('Live 2024！')).toBe('Live 2024！');
  });

  it('空字符串直接返回', async () => {
    expect(await toSimplified('')).toBe('');
  });
});