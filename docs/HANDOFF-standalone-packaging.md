# AuroraMusic 独立打包改造 — 工作交接文件

- 生成时间：本次会话（内容与交给接力 AI 的提示词逐字一致）
- 用法：把下方代码块内文本整体复制给任意新会话/新 AI 即可接续，无需其他上下文。
- 权威文档（先读）：`docs/superpowers/plans/2026-09-02-standalone-packaging.md` 与 `docs/superpowers/specs/2026-09-02-standalone-packaging-design.md`

```text
你要接手一个进行中的代码改造，请严格按下面的上下文与约束执行。

【项目】
路径 d:\AuroraMusic（Windows + PowerShell 7）。Tauri 2 + React 18 + TypeScript + Vite 6 的音乐应用「Flyme Music」，另含 supabase edge function 与迁移。目标：把它改造成不依赖 vite dev server、也不依赖任何线上后端的独立 Windows + Android 应用，并修复移动端播放器布局、Joox 繁体转简体、移动端无法下载歌曲三个问题。

【权威文档：先读这两个，里面有每个任务的完整代码与验证命令】
1. docs/superpowers/plans/2026-09-02-standalone-packaging.md  ← 15 个任务的实施计划（逐步、含可直接落地的代码）
2. docs/superpowers/specs/2026-09-02-standalone-packaging-design.md ← 设计规格与决策理由

【当前进度：Task 1–5 已完成，从 Task 6 开始】
分支 feat/standalone-packaging，提交历史（旧→新）：
76acbad 初始提交 / d7a16fa gitignore 加固 / ff0973b vitest 基建 / 2e81b0b apiTransport / ddc5ff5 传输层加固 / ccc1118 weapi 加密前端化 / 485bfe5 计划文档补录 / 7650bac weapi golden vector 测试 / c600ada 网易统一入口
已交付：git 仓库与 .gitignore；vitest（npm run test 当前 13 个用例全绿）；src/lib/apiTransport.ts（isTauri() / httpFetch()）；src/music/netease/weapi.ts（前端唯一 weapi 加密实现 + golden vector 测试）；src/music/netease/neteaseWeapi.ts（统一入口）+ src-tauri/src/netease.rs（Rust 命令 netease_post）+ vite 中间件退化为纯转发。
待做：Task 6 QQ 官方接口客户端化 / Task 7 GD-API 走 CORS-free 通道 + isAbort 加固 / Task 8 图片通道 blob 化 / Task 9 Joox 繁转简 / Task 10 AI 走 Rust 通道（key 编译期内嵌）/ Task 11 下载落盘 + toast / Task 12 删 legacy 本地账号 / Task 13 Tauri 配置权限与打包 / Task 14 移动端布局修复 / Task 15 端到端验证。

【环境硬约束——不遵守一定踩坑】
1. 项目在 IDE 工作区之外时，编辑器类文件写入工具会报 "can not edit the file outside the projects"。必须用 PowerShell 写文件：优先 [System.IO.File]::WriteAllText + UTF8 无 BOM + LF；读取可用只读工具。
2. 多行字符串替换会因 CRLF 差异静默失败。用单行唯一锚点做 $c.Replace(old,new)，或按行号切片重组；替换前先断言锚点命中数 == 1，替换后 Get-Content 回读。
3. PowerShell here-string 曾发生静默丢字符（https://u.y.qq.com 被写成 https://u.yqq.com，肉眼几乎看不出）。写完必须机器校验关键字符串（长 URL、十六进制、base64）是否逐字存在，并最终以测试/构建跑绿为准。
4. 部分工具链的安全校验会对文本中单独出现的标识符 cmd 误判并拒绝执行。变量/参数一律命名为 command，不要用 cmd。
5. 不要修改全局 git config（仓库级已配好 user.name=AuroraMusic / user.email=dev@auroramusic.local）。不要用 git commit --amend。
6. cargo check 首次或改依赖后可能要数分钟，用后台执行 + 轮询，不要误判为卡死。
7. .env.local 里有真实 AI key：绝不提交、绝不打印到报告里；已被 .gitignore 的 *.local 覆盖。
8. src-tauri/target 有约 3.8 GB 构建产物，已被忽略，不要试图提交或全量扫描它。

【每个任务的验收门槛：全绿才允许提交】
- npm run test（当前 13 passed，Task 9 后会增加）
- npx tsc -b --force（退出码 0；项目开了 strict + noUnusedLocals + noUnusedParameters，所以零错误同时证明无未使用 import）
- npm run build
- 涉及 Rust 的任务：cd src-tauri; cargo check（无 error；命令注册前的 dead_code 警告属正常）
- 涉及 dev 行为的任务：起 npm run dev 做真实 HTTP 验证（计划里给了具体验证脚本思路，例如用 Node 原生 TS type-stripping 直接 import 项目里的 .ts 生成请求体）

【必须落实的审查结论（计划文档里已写入，别漏）】
1. Task 11 的 Cargo 依赖必须写成 tauri-plugin-http = { version = "2", features = ["unsafe-headers"] }。不开这个 feature，Rust 侧会按 fetch 规范静默丢弃 Referer/Origin/Cookie，导致 QQ 官方接口与图片防盗链 403，而且 release 包连警告都没有。
2. Task 8 需要三件事：先加固 src/music/source/types.ts 的 forceHttps，让它处理协议相对 URL（开头补 if (url.startsWith('//')) return 'https:' + url;），因为 QQ 封面常见 //y.gtimg.cn/... 而 httpFetch 的 Tauri 分支会拒绝无 scheme 的 URL；imageSource.ts 要定义 BROWSER_UA 常量并在 Tauri 分支同时带 Referer 与 User-Agent（否则 Rust 侧填 tauri-plugin-http/<ver>，部分 CDN 会拒）；高频封面请求不要共用一个 AbortController（plugin-http 每次调用会给 signal 挂两个不摘的监听器）。
3. Task 7 除了把 fetchWithTimeout 里的 fetch 换成 httpFetch（注意 fetchWithTimeout 实际在 src/music/source/api-config.ts，不在 provider-utils.ts），还必须加固 provider-utils.ts 的 isAbort：plugin-http 取消时抛 Error('Request cancelled')，读响应流阶段甚至是裸字符串，name 不是 AbortError，不兼容的话用户切歌/离开搜索页会把健康的 GD-API 端点打进 5 分钟冷却。完整代码在计划 Task 7 Step 3b。
4. Task 13 必须删除 tauri.conf.json 里窗口的远程 url（https://flyme-music.pages.dev，现在打包的 dist 根本没被使用），CSP 必须放行 media-src https/http（否则在线音频播不出来）；并按计划 Step 3b 把 src/main.tsx 的 BrowserRouter 在打包环境切成 HashRouter（本地协议无 history 回退，深链重新载入会取不到 index.html），网页版保持 BrowserRouter。
5. AI 的 endpoint/key/model 由 src-tauri/build.rs 在编译期从 .env.local 读取并生成到 OUT_DIR 后 include! 进 ai.rs，前端只通过 invoke + tauri ipc Channel 拿流式增量，任何情况下不得把 key 暴露到前端。

【Task 5 的遗留清理，做 Task 6 时顺手处理】
- src/music/netease/netease-api.ts 第 5–10 行旧文件级注释仍写着 "Calls the dev-server weapi proxy which handles encryption & CORS."，已与新架构矛盾且与紧邻的新注释重复：删掉，或把其中"覆盖范围"那句并入新注释。
- 以下四点请评估后处置或明确记录为已知限制：Rust 的 netease_post 每次调用都新建 reqwest::Client（无连接池复用）且没有任何超时（上游卡住会永久挂起，前端 Tauri 分支又没传 signal，等于无法取消）；前端两处 JSON.parse(body) 没有 try/catch，上游返回风控 HTML 时会抛 SyntaxError 且各调用方处理不一致；vite 中间件对超长 cookie 的行为从"整体丢弃"变成了 slice(0,12000) 截断，可能产生畸形尾段。

【工作方式】
按计划文档从 Task 6 顺序执行到 Task 15。每个任务：读计划原文 → 实现（计划里给了完整代码，照落地即可）→ 跑验收门槛 → 用计划里给的那条 commit message 提交。计划中若出现行号与实际文件不符（前面任务已让行号漂移），一律以代码内容锚点为准，不要按行号盲改。遇到需要架构决策或与计划冲突的情况，先停下来说明并征询，不要自行扩大改动范围。全部完成后按计划 Task 15 做端到端验证：npm run test、tsc、build、cargo check、npx tauri dev 桌面回归清单、npm run tauri:build 出 NSIS 包并做断网启动验证、npm run tauri:build:android 出 apk 并按清单真机验证（含移动端布局量化标准：spacer 高度 ≤ 28px、封面底边到标题行顶边 ≤ 96px）。

【补充交接建议】
1. 图标已经做完了，不在待办里：源图 src-tauri/icons/app-icon.png（黑底白音符，圆角外透明），桌面与 Android 全套图标都已用 npx tauri icon 重新生成并验证过。以后换图标只需覆盖这个文件再重跑该命令。
2. AI key 建议尽快轮换：.env.local 里的 AURORA_AI_API_KEY 在本次会话上下文中出现过。轮换后必须重新执行打包命令，新 key 才会被编译进应用。
```