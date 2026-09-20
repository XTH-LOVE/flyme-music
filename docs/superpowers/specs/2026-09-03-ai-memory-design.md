# AI 长期记忆（越用越懂你）设计文档

- 日期：2026-09-03
- 状态：已与用户确认设计，待实施
- 范围：AI 升级第一期（长期记忆 + 个性化）；主动陪伴、语音交互、更多工具属于后续期，不在本 spec 内

## 1. 目标与背景

Flyme Music 的「一起听」AI（Flyme）已具备多轮工具调用 Agent（search_tracks / play / create_playlist / radio / control / analyze_song 等）、三种人设、听歌统计上下文。但每次对话都是"失忆"的：不记得用户上次说过喜欢谁、讨厌什么、聊过什么。

本期为 AI 增加跨会话长期记忆，使推荐与对话随使用越来越个性化，且对用户完全透明可管理。

## 2. 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 分期 | 第一期只做记忆；陪伴/语音/工具扩展后续期 |
| 存储 | Supabase 云端（登录用户，跨设备）；未登录降级 localStorage |
| 记忆形成 | 自动提炼 + Agent 主动 remember 工具（A+B 双通道） |
| 架构 | 不做向量检索 / RAG（YAGNI） |
| 模型 | 沿用现有 glm-4-flash（提炼调用免费） |

## 3. 数据层

新增迁移 `supabase/migrations/20260903_ai_memories.sql`：

```sql
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('artist','genre','mood','fact','dislike')),
  content text not null check (char_length(content) between 1 and 200),
  weight real not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists ai_memories_user_idx on public.ai_memories (user_id, last_seen_at desc);
alter table public.ai_memories enable row level security;
create policy "memories_owner_all" on public.ai_memories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- 前端经现有 `src/lib/supabase.ts` client 直连（anon key + 登录 session），RLS 隔离，无需新后端。
- category 语义：`artist` 喜欢的歌手；`genre` 风格/语种；`mood` 常见心情/场景；`fact` 用户主动交代的事；`dislike` 回避项（与现有 useAiStore.dislikes 互补：dislike 工具同时写两处，保证搜索回避逻辑与记忆同步）。

## 4. 记忆管线（新模块 `src/ai/memory.ts`）

### 4.1 类型

```ts
type AiMemoryCategory = 'artist' | 'genre' | 'mood' | 'fact' | 'dislike';
interface AiMemory { id: string; category: AiMemoryCategory; content: string; weight: number; lastSeenAt: number; }
/** 提炼/工具输出的待存条目；merge 统一处理，无需 add/update 语义区分 */
interface MemoryOp { category: AiMemoryCategory; content: string; }
```

### 4.2 读写与合并

- `loadMemories(): Promise<AiMemory[]>`：登录 → Supabase select；未登录 → localStorage（key `aurora.ai.memories`，同一结构）。
- `upsertMemories(ops: MemoryOp[]): Promise<void>`：合并规则（add/update 统一处理）——
  - 同 category 且 content 完全一致（trim 后）视为同一条：更新 lastSeenAt、weight += 1；
  - 否则新增（weight 1）；
  - 总量上限 50 条：超出时先淘汰 weight 最低、再按 lastSeenAt 最旧；
  - 纯函数 `mergeMemories(existing, ops, now): { list, changed }` 便于单测；持久化失败静默。
- localStorage 与云端不互相同步：登录后以云端为准（本地保留只读、不迁移，避免隐私意外上传）。

### 4.3 自动提炼（通道 A）

- `extractMemoryOps(recentTurns: AiChatMessage[], existing: AiMemory[]): Promise<MemoryOp[]>`
  - `chatOnce` 非流式调用；system 提示词明确：只提取稳定偏好与用户主动交代的事实（歌手/风格/心情/事件），不记闲聊、不猜、不超过 5 条；已存在的记忆不要重复输出；输出严格 JSON 数组，无其他文本；
  - `temperature: 0`，`max_tokens: 300`；
  - 输出解析容错（复用 aiTools 的宽松 JSON 思路），非法输出返回 `[]`。
- 触发：AiPage 的 agent 循环正常结束后 `void` fire-and-forget（取最近 6 条消息）；异常与空结果静默，绝不阻塞、不报错进 UI。

### 4.4 主动记忆（通道 B）

- aiTools 新增 `remember` 工具：`{"tool":"remember","category":"fact","content":"..."}`，校验 category 与 content 长度后走 `upsertMemories`；
- `describeToolCall` 加文案「记住了：…」；system prompt 工具清单追加该工具说明（用户交代偏好/约定/日程时调用）；
- 现有 `dislike` 工具扩展：同时写 useAiStore.dislikes（保持搜索回避）与 ai_memories（category='dislike'）。

### 4.5 记忆注入

- `memoryBlock(memories): string`：按类别压缩（如 `喜欢的歌手：周杰伦、Taylor Swift\n风格：国风、轻音乐\n…`），空则空串；
- `buildSystemPrompt` 增加 `memoryBlock` 参数，置于听歌记录之前；
- 提示词追加一句：可以自然引用记忆（"你上次说喜欢…"），但不要罗列、不要暴露"记忆数据库"字眼。

## 5. 界面与交互

- AiPage 顶部增加「记忆」胶囊入口：显示 `记忆 N 条`（未登录显示 `本地记忆 N 条`）；
- 点击打开记忆面板（沿用项目现有 Dialog/Sheet 组件风格）：
  - 按类别分组列表（中文分组名），每条显示 content 与 lastSeenAt 相对时间；
  - 每条右侧删除按钮；底部「清空全部」（二次确认）；
  - 空状态说明：「和我聊得越多，我就越懂你；你也可以让我"记住…"」；
- 状态放 useAiStore：`memories: AiMemory[]`、`memoryPanelOpen: boolean`、`refreshMemories()`（进入 AiPage 时加载）。

## 6. 隐私与降级

- 所有记忆用户可见、可删、可清空；
- 未登录：本地 localStorage 记忆，面板标注"本地记忆，登录后云同步"；本地内容不自动上传；
- 提炼调用仅使用现有 AI 通道（与聊天同一 endpoint/key），不新增数据接收方；
- `dislike` 搜索回避逻辑保持纯本地（useAiStore），不受登录态影响。

## 7. 测试与验收

- vitest 单测：
  - `mergeMemories`：去重合并、权重增长、50 条上限淘汰顺序；
  - 提炼输出解析：合法 JSON / 带前后缀 / 截断 / 空输出；
  - `memoryBlock`：分类压缩、空记忆；
  - remember/dislike 工具的参数校验分支；
- 四项门槛保持绿：`npm run test` 16+N 条全过、`npx tsc -b --force` 零错误、`npm run build` 双入口、`cargo check` 无 error；
- 迁移上线：本地 `supabase db push`（项目已 link）；若 CLI 无凭证则把 SQL 交给用户在 Supabase Dashboard SQL Editor 执行；
- 验收脚本：登录态下聊天两句含偏好 → 面板出现新记忆 → 刷新页面重进 AI 页，AI 能引用该记忆 → 删除记忆生效。

## 8. 明确不做（本期）

- 向量检索 / RAG / 对话全量存储；
- 主动陪伴（切歌点评、时段问候）、TTS/语音输入、音乐知识问答、AI 日报（后续期）；
- 记忆的手动新增/编辑（只读 + 删除；用户通过对话让 AI 记）；
- 本地记忆与云端的自动迁移/合并。
