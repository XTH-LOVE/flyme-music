# AI 主动陪伴（第二期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox tracking.

**Goal:** Aurora 主动开口：每日时段问候、连听里程碑关心、每周 AI 听歌报告（时间线 + 周报全局 toast），全量本地触发判定 + 静默降级。

**Architecture:** 新模块 `src/ai/proactive.ts`（纯函数触发判定 `evaluateTriggers` + 生成层 `generateProactive` + 本地模板）；headless 组件 `src/ai/ProactiveEngine.tsx` 挂在 AppLayout；`useAiStore` 增 `proactive` 开关；SettingsPage 加开关行。

**Spec:** `docs/superpowers/specs/2026-09-03-ai-proactive-design.md`

---

### Task 1: 纯函数触发判定（TDD）

**Files:** Create `src/ai/proactive.ts`、Test `src/ai/proactive.test.ts`

- [ ] **Step 1: 失败测试**（核心用例，实现需覆盖全部断言）

```ts
import { describe, expect, it } from 'vitest';
import { dayKey, evaluateTriggers, type ProactiveInput } from './proactive';

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
    const out = evaluateTriggers(base({ session: s, greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')), lastWeekly: Date.parse('2026-09-01T10:00:00') }));
    expect(out).toEqual(['milestone']);
    expect(evaluateTriggers(base({
      session: { ...s, milestoneKinds: ['milestone:minutes'] },
      greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')), lastWeekly: Date.parse('2026-09-01T10:00:00'),
    }))).toEqual([]);
  });
  it('milestone: three consecutive songs by one artist', () => {
    const s = { startedAt: Date.parse('2026-09-03T09:30:00'), artists: ['周杰伦', '周杰伦', '周杰伦'], milestoneKinds: ['milestone:minutes'] };
    const out = evaluateTriggers(base({ session: s, greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')), lastWeekly: Date.parse('2026-09-01T10:00:00') }));
    expect(out).toEqual(['milestone']);
  });
  it('milestone: session cap of 2 blocks a third', () => {
    const s = { startedAt: Date.parse('2026-09-03T08:00:00'), artists: ['A', 'A', 'A'], milestoneKinds: ['milestone:minutes', 'milestone:artist'] };
    const out = evaluateTriggers(base({ session: s, greetingDay: dayKey(Date.parse('2026-09-03T10:00:00')), lastWeekly: Date.parse('2026-09-01T10:00:00') }));
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: 红灯** `npx vitest run src/ai/proactive.test.ts`
- [ ] **Step 3: 实现 proactive.ts 纯函数部分**

```ts
export type ProactiveKind = 'greeting' | 'weekly' | 'milestone';

export interface SessionState {
  startedAt: number;
  artists: string[];
  milestoneKinds: string[];
}

export interface ProactiveInput {
  now: number;
  enabled: boolean;
  greetingDay: string | null;
  lastWeekly: number | null;
  lastGlobal: number | null;
  session: SessionState | null;
  playLog: { ts: number; artist: string; name: string }[];
}

const DAY = 86_400_000;
const GLOBAL_COOLDOWN_MS = 30 * 60_000;
const WEEK_MS = 7 * DAY;
const SESSION_MINUTES_THRESHOLD = 60;

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function evaluateTriggers(input: ProactiveInput): ProactiveKind[] {
  const { now, enabled } = input;
  if (!enabled) return [];
  const kinds: ProactiveKind[] = [];
  const cooling = Boolean(input.lastGlobal && now - input.lastGlobal < GLOBAL_COOLDOWN_MS);
  if (input.greetingDay !== dayKey(now) && !cooling) kinds.push('greeting');
  if ((!input.lastWeekly || now - input.lastWeekly >= WEEK_MS) && !cooling) kinds.push('weekly');
  const s = input.session;
  if (s && s.milestoneKinds.length < 2 && !cooling) {
    const minutes = (now - s.startedAt) / 60_000;
    if (minutes >= SESSION_MINUTES_THRESHOLD && !s.milestoneKinds.includes('milestone:minutes')) kinds.push('milestone');
    else {
      const last3 = s.artists.slice(-3);
      if (last3.length === 3 && last3.every((a) => a && a === last3[0]) && !s.milestoneKinds.includes('milestone:artist')) kinds.push('milestone');
    }
  }
  return kinds;
}
```

- [ ] **Step 4: 绿灯** → **Step 5: 提交** `feat(ai): proactive trigger evaluation`

---

### Task 2: 数据聚合 + 生成层 + 本地模板

**Files:** Modify `src/ai/proactive.ts`、Modify `src/ai/aiClient.ts`（chatOnce 可选参数）

- [ ] **Step 1: chatOnce 加可选参数（向后兼容）**

```ts
export async function chatOnce(
  cfg: AiConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
```
两处 `max_tokens: 120` → `opts?.maxTokens ?? 120`；`temperature: 0.9` → `opts?.temperature ?? 0.9`（浏览器分支 body 与 tauriChat body 都改）。

- [ ] **Step 2: proactive.ts 追加聚合/生成/模板**

```ts
import { chatOnce, type AiChatMessage } from './aiClient';
import { memoryBlock, type AiMemory } from './memory';
import { PERSONA_PROMPTS, buildLocalReport, type AiPersona } from './aiTools';

const GREETING_KEY = 'aurora.proactive.greeting';
const WEEKLY_KEY = 'aurora.proactive.weekly';
const GLOBAL_KEY = 'aurora.proactive.global';
const SESSION_KEY = 'aurora.proactive.session';

export function timeBucket(ts: number): '凌晨' | '早上' | '午后' | '傍晚' | '深夜' {
  const h = new Date(ts).getHours();
  if (h < 5) return '凌晨';
  if (h < 11) return '早上';
  if (h < 17) return '午后';
  if (h < 22) return '傍晚';
  return '深夜';
}

export interface WeekAggregates { total: number; activeDays: number; topSongs: string[]; topArtists: string[]; newArtists: string[]; }

export function aggregateWeek(playLog: { ts: number; artist: string; name: string }[], now: number): WeekAggregates {
  const weekAgo = now - WEEK_MS;
  const prev = new Map<string, number>();
  const week: typeof playLog = [];
  for (const e of playLog) (e.ts >= weekAgo ? week : prev.length || prev).constructor === Array ? week.push(e) : null;
  // 实现：两次遍历，勿使用上面占位写法——
  // const week = playLog.filter(e => e.ts >= weekAgo);
  // const before = playLog.filter(e => e.ts < weekAgo);
  ...
}
```

（实现时用清晰的两次 filter + Map 计数：`week`/`before`；topSongs/topArtists 取出现次数前 3；newArtists = week 中的歌手不在 before 集合内，取前 3；activeDays = week 中去重 dayKey 数。此处留待实现按 spec §3.3 直写，勿保留占位。）

生成层：

```ts
async function generateText(kind: ProactiveKind, persona: AiPersona, memoryInfo: string, dataText: string, model: string): Promise<string | null> {
  const task = kind === 'greeting'
    ? '写一句不超过 40 字的问候，自然结合时段与用户的听歌偏好，不要列表、不要 emoji、不要提问以外的客套。'
    : kind === 'milestone'
      ? '写 1-2 句关心或提议（如连续听歌较久/连续听同一位歌手），口语化，不要列表和 emoji。'
      : '根据数据写 4-6 句上周听歌报告：点名最爱歌曲与歌手、发现的新口味、结合长期偏好给一句鼓励或建议。语气自然有温度，不要列表和 emoji。';
  try {
    const text = await chatOnce(
      { model },
      [
        { role: 'system', content: PERSONA_PROMPTS[persona] + ' ' + task + (memoryInfo ? '\n你对用户的长期了解：' + memoryInfo : '') },
        { role: 'user', content: dataText },
      ],
      undefined,
      { maxTokens: kind === 'weekly' ? 500 : 90, temperature: 0.9 },
    );
    const t = text.trim();
    return t || null;
  } catch {
    return null;
  }
}
```

本地模板：`localGreeting(bucket, seed)`（按时段各 2 条轮换）、`localMilestone(kind, context)`、weekly 回退 `buildLocalReport(playLog)`。

- [ ] **Step 3: 绿灯（全部测试）+ 门槛 + 提交** `feat(ai): proactive generation with local fallbacks`

---

### Task 3: 开关 + 引擎挂载 + 设置行

**Files:** Modify `src/store/useAiStore.ts`、Create `src/ai/ProactiveEngine.tsx`、Modify `src/components/AppLayout.tsx`（挂载点）、Modify `src/pages/SettingsPage.tsx`

- [ ] **Step 1: store 开关**：`AiConfigState` 增 `proactive: boolean`；`loadConfig` 默认 `true` + 解析持久化值；`setConfig` 的 `persist` 对象加 `proactive: next.proactive`。
- [ ] **Step 2: ProactiveEngine 组件**（headless，无 UI）：

```tsx
export function ProactiveEngine() {
  // 读 model/persona/proactive；onMount 一次性：evaluateTriggers（greeting/weekly）
  // 订阅 currentKey：更新 sessionStorage 会话（startedAt 首次写、artists push、evaluateTriggers milestone）
  // 每个触发：读频控 → generateProactive → pushMessage({ role:'ai', kind:'chat', text }) → weekly 额外 notify() → 写频控时间戳
  // AI 未配置（aiConfigured false）时 greeting/milestone 用本地模板文案，weekly 用 buildLocalReport
  return null;
}
```

（生成入口统一 `generateProactive(kind, { persona, model, memoryInfo, dataText })`：内部按 `aiConfigured` 决定 AI 或模板。）
- [ ] **Step 3: 挂载**：AppLayout 中 `<AiCompanion />` 旁加 `<ProactiveEngine />`。
- [ ] **Step 4: SettingsPage** 「切歌陪伴」行后加「主动陪伴」行（同结构 Switch，描述「时段问候、连听关心与每周听歌报告」）。
- [ ] **Step 5: 门槛全绿 + 提交** `feat(ai): proactive companion engine, settings toggle, mount`

---

### Task 4: 全量门槛 + 部署 + 线上验收

- [ ] `npm run test`（31+N 全绿）、`npx tsc -b --force`、`npm run build`、`cargo check`
- [ ] 重建 `release-cf` 并 `npx wrangler pages deploy release-cf --project-name flyme-music --branch main --commit-dirty=true`
- [ ] 线上验证：清 `aurora.proactive.greeting` 后刷新 → 「一起听」时间线出现问候（或本地模板）；toast 仅周报触发时出现

---

## Self-Review

- Spec §3 三个触发器 → Task 1/2；§4 引擎 → Task 3；§5 设置 → Task 3；§6 测试 → Task 1 测试 + Task 4 验收；§7 未引入越界功能。
- chatOnce 签名变更向后兼容（可选参数）。
- 无占位符：Task 2 中 aggregateWeek 的占位写法已在注释中明确要求实现时替换为两次 filter + Map 计数直写。
