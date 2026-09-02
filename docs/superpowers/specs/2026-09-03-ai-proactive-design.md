# AI 主动陪伴（第二期）设计文档

- 日期：2026-09-03
- 状态：已与用户确认设计，待实施
- 范围：AI 升级第二期——主动陪伴（时段问候 / 连听里程碑 / AI 周报）；语音交互、更多工具属后续期
- 前置：第一期长期记忆已上线（`src/ai/memory.ts`、`ai_memories` 表）

## 1. 目标与现状

现状：Aurora 已有成熟的**切歌自动解读**（`src/components/ai/AiCompanion.tsx`，headless 挂载于 AppLayout：切歌 → 时间线卡片 → 歌词读取 → 流式点评 → 缓存/超时降级/设置开关）。

本期让 Aurora 会**主动开口**：时段问候、连听里程碑关心、AI 听歌周报。所有触发条件由本地数据可判定，禁止模型猜测情绪；所有生成失败静默降级，绝不打扰。

## 2. 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 消息位置 | 全部进「一起听」时间线；周报额外弹全局 toast（复用 `utils/notify`） |
| 频控 | 问候 1 次/天；里程碑每次会话 ≤2 条；周报 ≥7 天一次；全局冷却 30 分钟内 ≤1 条 |
| 设置 | SettingsPage 新增「主动陪伴」总开关（默认开，独立于现有「切歌陪伴」） |
| 降级 | 未配置 AI：问候/里程碑用本地文案模板，周报用现有模板 `buildLocalReport` |
| 模型 | 现有 `chatOnce` 通道（glm-4-flash，免费），带 persona + memoryBlock + 数据块 |

## 3. 触发器定义（本地可判定）

新模块 `src/ai/proactive.ts`：

```ts
type ProactiveKind = 'greeting' | 'milestone' | 'weekly';
interface Trigger { kind: ProactiveKind; payload: Record<string, unknown>; }
```

### 3.1 时段问候 `greeting`
- 触发：应用启动后 `AiCompanion` 挂载时检查 `localStorage('aurora.proactive.greeting')` 的日期 ≠ 今天
- 数据：当前时段（凌晨/早上/午后/傍晚/深夜）、memoryBlock 摘要、昨日播放次数与 Top 歌曲
- 生成：AI 一句话问候（≤40 字），结合记忆自然一点；AI 失败用本地模板（按时段固定 4 选 1 轮换）

### 3.2 连听里程碑 `milestone`
- 触发（每次切歌后检查，`PlayerStore.current` 变化即驱动）：
  - `sessionMinutes >= 60`（会话内首播时间起算）→ 关心句
  - 会话内连续 3 首（不含重复计数中断）同一歌手 → 提议"再多排几首"
- 频控：每会话 ≤2 条（`sessionStorage`），同类触发后本会话不再触发
- 生成：AI 1-2 句（带当前歌曲/歌手/会话时长上下文）；失败用本地模板

### 3.3 AI 周报 `weekly`
- 触发：挂载时检查 `localStorage('aurora.proactive.weekly')` 距今 ≥7 天
- 数据：近 7 天 playLog 聚合（总次数、活跃天数、Top 3 歌曲、Top 3 歌手、新出现的歌手、时段分布粗分）
- 生成：AI 写 4-6 句有温度的周报（点名最爱、发现新口味、一句基于记忆的鼓励/建议）；失败用现有 `buildLocalReport` 模板
- 呈现：时间线消息 + `notify('Aurora 为你生成了上周听歌报告')`

## 4. 引擎架构

```
AppLayout
  └── <AiCompanion />          # 现有切歌解读（不动）
  └── proactive 引擎（并入 AiCompanion 组件内挂载，或同文件并列导出 <ProactiveEngine/>）
        ├── onMount: greeting + weekly 检查（一次性）
        ├── 订阅 currentKey 变化: milestone 检查 + 会话统计
        └── 频控器（localStorage/sessionStorage 时间戳与计数）
```

- 触发判定为纯函数：`evaluateTriggers(input): ProactiveKind[]`（输入当前时间、playLog、会话统计、频控记录；输出应触发的种类），单测覆盖。
- 生成统一走 `generateProactive(kind, payload): Promise<string | null>`：组装 persona + memoryBlock + 数据块 → `chatOnce`；任何异常返回 null → 调用方使用本地模板文案。
- 消息入时间线：`pushMessage({ role:'ai', kind:'chat', text })`，带 `ts`。
- 写入时间戳在**成功入线后**（AI 失败也写，避免失败风暴；greeting 按"当天"键值天然去重）。
- 开关：`useAiStore` 新增 `proactive: boolean`（默认 true，持久化进现有 `aurora.ai.v1` config）；关闭时 `evaluateTriggers` 直接返回空。

## 5. 设置界面

SettingsPage 的「切歌陪伴」行下方新增一行「主动陪伴」：开关 + 描述「时段问候、连听关心与每周听歌报告」。

## 6. 测试与验收

- vitest（纯函数）：
  - `evaluateTriggers`：greeting 当日去重、weekly 7 天间隔、milestone 会话上限 2 条、30 分钟全局冷却、开关关闭全灭、连 3 首同歌手与 60 分钟判定
  - 本地模板兜底路径（AI null → 模板文案非空）
- 门槛：`npm run test` 全绿（31+N）、`npx tsc -b --force` 零错误、`npm run build` 双入口、`cargo check` 无 error
- 验收：改本地时间戳模拟跨天/跨周 → 时间线出现问候/周报 → 全局 toast 出现 → 关闭开关后不再出现

## 7. 明确不做（本期）

- 天气/LBS 等外部数据源；基于歌名猜测情绪的"情绪感知"（不可靠，砍掉，用可判定的里程碑替代）
- 主动执行工具（主动消息只说话，不动播放器/队列）
- 语音交互、音乐知识问答、每日日报推送（后续期）
- Web Push / 离线推送
