# xth 复刻完成度审计

更新时间：2026-10-06

本文只记录功能思路和 AuroraMusic 的当前落点，不复制参考项目代码。

## 已完成或已有等价实现

| 能力 | AuroraMusic 落点 | 状态 |
| --- | --- | --- |
| 播放请求代际控制 | `src/player/PlayerController.ts` 的 `playbackRequestId` | 已有并继续强化 |
| 下一首音频/封面/歌词预取 | `src/player/playbackPrefetch.ts`、`src/hooks/usePrefetch.ts` | 已完成 |
| 循环全部队首预取 | `src/player/playbackPrefetch.ts` | 已完成 |
| 音源失败冷却与排序 | `src/music/source/sourceHealth.ts`、`src/player/alternateSource.ts` | 已完成 |
| API 超时、错误分类、退避重试 | `src/music/source/requestError.ts`、`provider-utils.ts` | 已完成 |
| 多音源自动换源 | `src/player/alternateSource.ts` | 已有并继续强化 |
| LRC/增强 LRC/TTML/逐词歌词 | `src/utils/timedLyrics.ts` | 已完成 |
| 歌词真实性与逐词安全降级 | `src/utils/lyricTruth.ts`、`currentLyric.ts` | 已完成 |
| 歌词拖动、回弹、末句居中 | `LyricsView.tsx`、`lyricFocus.ts`、播放器 CSS | 已完成 |
| 桌面/悬浮歌词 | `src/hooks/useDesktopLyrics.ts`、`src/lib/nativeMedia.ts` | 已有 |
| 离线音频缓存与 LRU | `src/library/offlineCache.ts` | 已完成 |
| 下载队列恢复与失败重试 | `src/utils/downloadQueue.ts` | 已完成 |
| EQ、频谱、响度匹配、动态分析 | `src/player/webAudio.ts`、`src/audio/analysis/` | 已有；已补 10 段 EQ 兼容链 |
| 沉浸式封面与封面转场 | `FullPlayer.tsx`、`immersive.css`、`coverTransition.ts` | 已有 |
| 系统媒体控制 | `src/hooks/useMediaSession.ts`、`nativeMedia.ts` | 已有 |
| 本地音乐库、重复检测 | `src/library/localLibrary.ts`、`DuplicateSongsPanel.tsx` | 已有并强化 |
| 本地歌曲元数据编辑 | `localLibrary.ts`、`useLocalLibraryStore.ts`、`TrackActionsSheet.tsx` | 已完成 |
| 播放诊断快照 | `src/diagnostics/playbackDiagnostics.ts` | 已完成 |
| 设置页播放/下载诊断 | `src/pages/SettingsPage.tsx` | 已完成 |
| 下载字节进度与进度条 | `src/utils/download.ts`、`downloadQueue.ts`、`SettingsPage.tsx` | 已完成 |
| 下载中止、失败重试、已完成清理 | `src/utils/downloadQueue.ts`、`SettingsPage.tsx` | 已完成 |
| 智能下一首建议 | `src/player/smartQueue.ts`、`QueueSheet.tsx` | 已完成；优先使用已缓存听感特征，用户点击后才插入 |

## 可继续复刻但需要较大架构/产品范围

| 能力 | 原因 | 当前决定 |
| --- | --- | --- |
| 真正无缝双音轨播放 | 需要改 `PlayerEngine` 为双 Audio/MediaSource 调度 | 暂不接入，避免破坏现有播放器 |
| AutoMix/BPM 过渡 | 需要双音轨、节拍对齐和可回退混音策略 | 暂不接入 |
| 10 段参数 EQ | 已兼容旧三段设置并接入现有播放器面板 | 已接入 |
| 音乐墙/大规模虚拟网格 | 当前页面已有渐进列表，新增墙会改变布局 | 暂不接入 |
| SMB/网络盘 | 需要 Tauri Rust 文件系统与权限 | 暂不接入 Web 端 |
| 插件系统/Gateway | 安全边界、权限模型和版本兼容成本高 | 暂不接入 |
| Last.fm/第三方 Scrobble | 需要账号授权、隐私设置和服务端密钥 | 暂不接入 |
| 多设备同步 | 需要账户模型、冲突解决和后台服务 | 暂不接入 |
| CarPlay/Spotify 等平台集成 | 不属于当前 Web/Tauri 能力范围 | 不复刻 |

## 六个参考项目的已吸收重点

- Auralux：缓存、源健康、错误可诊断、同步状态与可重试思路。
- MusicBox：参数化 EQ、媒体资源校验、网络请求错误分级。
- awesome-music-player：本地库、媒体队列、基础播放状态组织。
- Kumone：离线缓存生命周期、下载恢复、资源完整性校验、响度/节拍分析思路。
- Tingjing：歌词真实性、逐词拒绝原因、播放请求协调、预取代际控制。
- YesPlayMusic：歌词解析、队列持久化、网易云数据层、系统媒体控制。

## 2026-10-06 音乐 Agent 复刻增量

本轮下载并分析了以下参考仓库，源码保存在 `references/`，没有直接复制其实现：

- `references/MCP-MusicAssistant`：吸收高层播放工具思想，把搜索、跨源选择、播放和失败回退收进一个 `play_music` 入口。
- `references/sonagram`：吸收“Agent 解释请求、确定性音乐引擎选歌和审计”的分层思路。
- `references/sonara`：吸收 BPM、能量、调性、频段、动态等本地特征作为可验证的音乐知识层。
- `references/simil`：吸收文件/文本/声音相似检索的统一接口思想；当前 Web 端使用已有本地音频特征向量，CLAP/EffNet 可通过后端适配器继续接入。
- `references/latentjam`：吸收播放完成率、跳过、重复、收藏、短期与长期口味中心的行为建模思路。

本轮新增落点：

| 能力 | AuroraMusic 落点 | 状态 |
| --- | --- | --- |
| 高层音乐 Agent | `src/ai/aiTools.ts` 的 `play_music` | 已接入：规划、检索、排序、验证、播放、解释 |
| 统一歌曲实体 | `src/ai/musicEntity.ts` | 已接入：跨源同曲归并、优先选择稳定音源 |
| 播放行为模型 | `src/ai/listeningEvents.ts`、`src/hooks/usePlaybackSync.ts` | 已接入：started/completed/skipped/liked/disliked/repeated/manuallyQueued |
| 短期/长期口味画像 | `src/ai/tasteProfile.ts` | 已接入：30 天与 365 天窗口、艺人亲和度、跳过惩罚、完成/重复加权、音频特征中心 |
| 推荐验证器 | `src/ai/musicVerifier.ts` | 已接入：实体去重、禁忌过滤、艺人连续度、时长和候选数量检查 |
| 自动重试 | `play_music` 内部 verifier-driven retry | 已接入：候选不足时扩大检索后再次验证 |
| 高层工具协议 | `src/ai/toolProtocol.ts` | 已接入 `play_music`，旧低层工具保持兼容 |
| 可选 CLAP/EffNet 语义重排 | `src/ai/embeddingClient.ts`、`/api/music/rank` | 已接入可替换协议；未配置服务时自动回退本地 DSP |

### 当前边界

`simil` 的 CLAP/EffNet 属于重量级模型，不能在没有模型服务的浏览器里凭空复刻。本版本先复用了 AuroraMusic 已有的本地 DSP 特征和 IndexedDB 特征缓存，因此“按听感找相似”已经是真实测量，不是艺人关键词伪装；如果要达到 CLAP 的文本-音频跨模态精度，下一步需要配置本地 Python 推理服务或远程 embedding endpoint，再接入 `musicEntity`/`tasteProfile` 的向量接口。

同样，参考仓库里的 Android/iOS 原生库扫描、多播放器组播、Rust SIMD 分析和完整 MCP Server 没有硬搬进 Web/Tauri 前端，以免破坏现有音源、播放器和移动端架构；AuroraMusic 采用了等价的 TypeScript 本地能力和可替换适配点。

## 验证门槛

- `npm run build`
- `npx tsc -b`
- `npx eslint src --quiet`
- `npm test`
- 不把 `xth` 外部参考项目纳入 AuroraMusic 的 lint 范围。
