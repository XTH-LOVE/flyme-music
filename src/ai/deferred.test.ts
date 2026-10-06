import { beforeEach, describe, expect, it } from 'vitest';
import { cancelDeferred, flushDeferred, listDeferred, parseDeferTag, scheduleDeferred, stripDeferSyntax } from './deferred';

describe('deferred AI messages', () => {
  beforeEach(() => localStorage.clear());

  it('parses and schedules a defer tag', () => {
    const parsed = parseDeferTag('好的\n<defer>{"message":"继续听歌","after_minutes":1,"trigger":"music"}</defer>');
    expect(parsed?.clean).toBe('好的');
    const item = scheduleDeferred(parsed!.message, parsed!.afterMinutes, parsed!.trigger, 1_000);
    expect(listDeferred(1_000)).toHaveLength(1);
    expect(flushDeferred(item.fireAt)).toHaveLength(1);
  });

  it('parses the attribute-style defer tag emitted by some models', () => {
    const parsed = parseDeferTag('好的\n<defer message="别忘了继续享受音乐时光哦！" after_minutes="60" trigger="定时提醒" />');
    expect(parsed).toEqual({
      clean: '好的',
      message: '别忘了继续享受音乐时光哦！',
      afterMinutes: 60,
      trigger: '定时提醒',
    });
  });

  it('hides defer markup during streaming', () => {
    expect(stripDeferSyntax('继续听歌 <defer message="提醒" after_minutes="60" trigger="timer" />')).toBe('继续听歌');
  });

  it('cancels a pending item', () => {
    const item = scheduleDeferred('x', 10, 'test', 1_000);
    expect(cancelDeferred(item.id)).toBe(true);
    expect(listDeferred()).toHaveLength(0);
  });
});
