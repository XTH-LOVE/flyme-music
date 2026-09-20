import { describe, expect, it, vi } from 'vitest';

// aiTools 的导入链会碰 useThemeStore（window.matchMedia）；node 测试环境补齐。
// 必须在动态 import ./proactive 之前就位，因此这里不能静态导入被测模块。
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
});
vi.stubGlobal('document', { documentElement: { setAttribute() {} } });

const proactive = await import('./proactive');
const { dayKey, evaluateTriggers } = proactive;
type ProactiveInput = import('./proactive').ProactiveInput;

const base = (over: Partial<ProactiveInput> = {}): ProactiveInput => ({
  now: Date.parse('2026-09-03T10:00:00'),
  enabled: true,
  greetingDay: null,
  lastWeekly: null,
  lastGlobal: null,
  session: null,
  playLog: [],
  ...over,
});

describe('evaluateTriggers', () => {
  it('fires greeting + weekly on a fresh install', () => {
    expect(evaluateTriggers(base())).toEqual(['greeting', 'weekly']);
  });

  it('suppresses greeting on the same day', () => {
    const day = dayKey(Date.parse('2026-09-03T10:00:00'));
    expect(evaluateTriggers(base({ greetingDay: day }))).toEqual(['weekly']);
  });

  it('suppresses weekly within 7 days', () => {
    const last = Date.parse('2026-09-01T10:00:00');
    expect(evaluateTriggers(base({ lastWeekly: last }))).toEqual(['greeting']);
  });

  it('global cooldown (30min) blocks everything', () => {
    const last = Date.parse('2026-09-03T09:50:00');
    expect(evaluateTriggers(base({ lastGlobal: last }))).toEqual([]);
  });

  it('disabled kills everything', () => {
    expect(evaluateTriggers(base({ enabled: false }))).toEqual([]);
  });

  it('milestone: 60-minute session fires once per session', () => {
    const s = { startedAt: Date.parse('2026-09-03T08:50:00'), artists: ['周杰伦'], milestoneKinds: [] };
    const gates = {
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')),
      lastWeekly: Date.parse('2026-09-01T10:00:00'),
    };
    expect(evaluateTriggers(base({ session: s, ...gates }))).toEqual(['milestone']);
    expect(evaluateTriggers(base({ session: { ...s, milestoneKinds: ['milestone:minutes'] }, ...gates }))).toEqual([]);
  });

  it('milestone: three consecutive songs by one artist', () => {
    const s = {
      startedAt: Date.parse('2026-09-03T09:30:00'),
      artists: ['周杰伦', '周杰伦', '周杰伦'],
      milestoneKinds: ['milestone:minutes'],
    };
    const out = evaluateTriggers(base({
      session: s,
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')),
      lastWeekly: Date.parse('2026-09-01T10:00:00'),
    }));
    expect(out).toEqual(['milestone']);
  });

  it('milestone: session cap of 2 blocks a third', () => {
    const s = {
      startedAt: Date.parse('2026-09-03T08:00:00'),
      artists: ['A', 'A', 'A'],
      milestoneKinds: ['milestone:minutes', 'milestone:artist'],
    };
    const out = evaluateTriggers(base({
      session: s,
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')),
      lastWeekly: Date.parse('2026-09-01T10:00:00'),
    }));
    expect(out).toEqual([]);
  });

  it('milestone: consecutive streak broken by a different artist does not fire', () => {
    const s = {
      startedAt: Date.parse('2026-09-03T08:00:00'),
      artists: ['周杰伦', '林俊杰', '周杰伦'],
      milestoneKinds: ['milestone:minutes'],
    };
    const out = evaluateTriggers(base({
      session: s,
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')),
      lastWeekly: Date.parse('2026-09-01T10:00:00'),
    }));
    expect(out).toEqual([]);
  });

  it('dj: fires every 5 session tracks, then waits for 5 more', () => {
    const mkSession = (djCount: number | undefined, n: number) => ({
      startedAt: Date.parse('2026-09-03T09:00:00'),
      artists: Array.from({ length: n }, (_, i) => '歌手' + i),
      // Milestone kinds saturated so the DJ assertions stay isolated.
      milestoneKinds: ['milestone:minutes', 'milestone:artist'],
      ...(djCount === undefined ? {} : { djCount }),
    });
    const mount = { greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')), lastWeekly: Date.parse('2026-09-01T10:00:00') };
    // 4 tracks: below the interval.
    expect(evaluateTriggers(base({ session: mkSession(undefined, 4), ...mount }))).toEqual([]);
    // 5 tracks since session start: fires.
    expect(evaluateTriggers(base({ session: mkSession(undefined, 5), ...mount }))).toContain('dj');
    // Fired at 5 (djCount=5): not again at 7.
    expect(evaluateTriggers(base({ session: mkSession(5, 7), ...mount }))).toEqual([]);
    // Fired at 5: fires again at 10.
    expect(evaluateTriggers(base({ session: mkSession(5, 10), ...mount }))).toContain('dj');
  });

  it('dj: respects the global cooldown', () => {
    const s = {
      startedAt: Date.parse('2026-09-03T09:00:00'),
      artists: ['a', 'b', 'c', 'd', 'e'],
      milestoneKinds: [],
    };
    const out = evaluateTriggers(base({
      session: s,
      lastGlobal: Date.parse('2026-09-03T09:45:00'),
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')),
      lastWeekly: Date.parse('2026-09-01T10:00:00'),
    }));
    expect(out).toEqual([]);
  });
});
