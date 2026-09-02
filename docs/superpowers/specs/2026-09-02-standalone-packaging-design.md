# 2026-09-02 独立打包（脱离 vite 运行期依赖）设计

## 目标

把 Flyme Music（AuroraMusic）打包成**完全自带的桌面（Windows NSIS）+ Android** 应用：

- 运行期不依赖 vite dev server 的 `/api` 代理，也不依赖任何线上后端
- AI 的 API key 编译进 Rust 侧，前端不持有
- 纯浏览器 `npm run dev` 的开发体验保持不变（vite 保留为前端构建工具与 dev 代理）
- 顺带修复四个已知问题：移动端 FullPlayer 布局、应用图标流水线、Joox 繁体转简体、移动端无法下载歌曲

## 现状（证据）

- 全部 `/api` 后端逻辑在 `vite.config.ts` 的 dev 中间件：AI 透传、网易 weapi、QQ 音乐、图片/媒体代理、legacy 本地账号
- `tauri.conf.json` 窗口 `url` 指向远程 `https://flyme-music.pages.dev`，打包的 `dist` 实际未被使用；`csp: null`
- 桌面快捷 F11 逻辑在 `src-tauri/src/lib.rs`，与本次改动无冲突
- 移动端布局：`halcyon.css` 移动封面 `width/height: min(84vw, 50vh)`（410 与 678 行重复声明），`.hc-p-spacer { flex: 1 1 clamp(10px,3vh,28px) }` 无 `max-height` → 真机细长屏（21:9）上空隙失控
- 图标：`src-tauri/icons/` 全部由 2026-08-31 `tauri icon` 生成；项目内没有保留图标源图
- Joox：`base-provider.ts` 的 search/getLyric 返回繁体内容（`normalizeTrack`、`getLyric` 无转换）
- 下载：`download.ts` 用 `fetch('/api/media-proxy')` + `a[download]` blob——Android WebView 不触发下载，移动端网页（尤其 iOS Safari）对 `a[download]` 支持不可靠

## 方案选择

采用**混合直连**（已确认）：

- 音乐源：前端用 `tauri-plugin-http` 直连上游（绕过 CORS），weapi 加密移入前端 JS
- AI：Rust command + tauri ipc Channel 流式转发，key 存 Rust 侧
- 被否决的方案：全部逻辑进 Rust 自定义协议（工作量过大）；Node sidecar（Android 不支持）

---

## 工作流 1：API 传输抽象层

新增 `src/lib/apiTransport.ts`：

- `isTauri()`：探测 `window.__TAURI_INTERNALS__`
- `httpFetch(url, init)`：Tauri 环境 → `@tauri-apps/plugin-http` 的 `fetch`（经 Rust 层，无 CORS）；浏览器环境 → `window.fetch`
- 现有 16 处写死 `fetch('/api/...')` 的调用统一改走该层或专用封装（见各工作流）

**浏览器 dev 回退约定**：非 Tauri 环境下，网易/QQ/图片/媒体调用回退到 `/api/...`（vite 中间件保留，dev 不变）。

## 工作流 2：音乐源直连化

- 新增 `src/music/netease/weapi.ts`：把 `vite.config.ts` 里的 NONCE/IV/PUB_KEY/MODULUS、`modPow`（纯 BigInt，直接复用）迁入；`aesEncrypt` 改用 WebCrypto `AES-CBC`
- **单一加密实现**：`netease-api.ts`、`charts.ts`、`currentLyric.ts`、`netease-auth.ts` 统一走 `neteaseWeapi(path, data, cookie)`，加密只在 `weapi.ts` 做一份；传输层分两条：Tauri → Rust 命令 `netease_post(path, form, cookie)`（返回 `{body, cookies}`，可靠拿到扫码登录的 Set-Cookie）；浏览器 dev → 中间件改为转发预加密表单并回传同样的 `{body, cookies}` 信封
- QQ 官方接口（榜单/榜单封面/歌词）逻辑从中间件移植到 `src/music/qq/qq-api.ts`，成为唯一实现；Tauri 经 `httpFetch` 直连并显式带 `Referer: https://y.qq.com/`，浏览器 dev 经新增的通用中间件 `/api/proxy?url=&referer=` 转发；原 `qqMusicProxy` 中间件删除。Joox/GD-API（`api-config.ts`）在 Tauri 环境改经 `httpFetch`
- 图片：`ProxyImg`/`TrackCover`/`AmbientBackdrop` 的 proxy 阶段改为 `httpFetch` 拉字节 → `blob:` URL，模块级 Map 缓存（容量上限 200，FIFO 淘汰），失败回退渐变占位（现状逻辑不变）
- `plugin-http` scope 设为 `https://**`（key 均在 Rust 侧、前端无敏感凭据，放宽白名单避免封面/媒体域名遗漏）

## 工作流 3：AI 走 Rust 通道（key 内置）

- `src-tauri/src/ai.rs`：三个 command
  - `ai_status() -> {configured, endpoint, model}`
  - `ai_models() -> Vec<String>`
  - `ai_chat_completions(body_json: String, on_delta: Channel<AiChunk>)`：reqwest（`stream` feature）调上游 SSE，逐块经 Channel 推送 `{delta?, thought?, done?, error?}`
- 配置内嵌：`build.rs` 读取项目根 `.env.local` 的 `AURORA_AI_ENDPOINT/API_KEY/MODEL`，生成到 `OUT_DIR` 的 `ai_config.rs`，`include!` 进 `ai.rs`；缺 key 时 `configured=false`（AI 功能优雅降级，不 panic）
- 前端 `aiClient.ts`：`getAiStatus`/`listAiModels`/`chatStream` 改为 `invoke`；`chatStreamWithFallback`、`chatOnce` 及所有上层（AiPage、aiTools）逻辑不变
- `.gitignore` 已有 `*.local`，key 不入库

## 工作流 4：账号系统瘦身

- 删除 `vite.config.ts` 的 `auroraAuthProxy` 及 `.aurora-auth.json` 读写
- 删除 `useAuthStore` 的 legacy 分支（`legacyRequest`、register/login/profile 的非 Supabase 路径）
- 账号只走 Supabase（线上已验证可用）

## 工作流 5：Tauri 配置与打包

- `tauri.conf.json`：移除窗口 `url` 远程地址（桌面/Android 均加载本地 `dist`）；`csp` 设为 `default-src 'self'; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'`（`plugin-http`/`invoke` 不受 CSP 约束，`'unsafe-inline'` 仅为现有内联样式兜底，实施时验证是否必需）
- 版本号统一 `0.3.0`（package.json / tauri.conf.json / Cargo.toml）
- 路由：打包环境改用 `HashRouter`（Tauri 本地协议无 history 回退，深链重新载入会取不到 index.html），浏览器 dev 与网页版保持 `BrowserRouter`
- `media-src` 必须在 CSP 中放行 https/http，否则在线音频无法播放
- `package.json` 增加 scripts：`tauri:build`（NSIS）、`tauri:build:android`
- Android：确认 `INTERNET` 权限（模板默认有）；`AndroidManifest.xml` 允许明文 HTTP（部分图片回退 URL 是 http，`forceHttps` 已覆盖大部分，兜底开启 `usesCleartextTraffic`）

## 工作流 6：移动端下载修复

- Tauri 环境：新增 Rust command `download_and_save(url, file_name) -> String`，由 Rust 用 reqwest 直接拉流写盘（音频几 MB~几十 MB，不经 IPC 传字节）；桌面先经 `tauri-plugin-dialog` 另存为，Android 写入 `download_dir()`（失败回退 `app_data_dir()`）下的 `FlymeMusic/`，返回落盘路径，前端 toast 提示。已知限制：Android 作用域存储下文件位于应用专属目录，写入公共 Download 需 MediaStore，列为后续增强
- 浏览器移动网页：优先 Web Share API（`navigator.canShare({ files })` → `navigator.share`，iOS Safari 与 Android Chrome 均可"存储到文件"）；不支持时回退现有 `a[download]`
- `downloadTrack` 重构：字节获取统一走 `httpFetch`（Tauri 经 Rust 层绕 CORS，浏览器走 `/api/media-proxy`）；`FullPlayer.handleDownload` 把错误 toast 出来（现状 `catch { /* non-fatal */ }` 静默吞掉）

## 工作流 7：Joox 繁体转简体

- 新增 `src/utils/t2s.ts`：`await import("opencc-js")` 懒加载转换器（`Converter({ from: "tw", to: "cn" })`），导出异步 `toSimplified(text)`；仅在使用 Joox 时才载入词典分块，手写映射表方案已否决（数据量大且易漏字）
- 应用点（仅 `source === 'joox'`）：
  - `BaseMusicProvider.search`（异步层）：对 `source === "joox"` 的结果转换 `name`/`artist`/`album`；`normalizeTrack` 保持同步纯函数不动
  - `base-provider.getLyric`：`lyric` 转换（`tlyric` 不动）
- 映射表放独立文件 `src/utils/t2s-table.ts`，避免污染工具逻辑

## 工作流 8：移动端 FullPlayer 布局修复

- `halcyon.css` 移动段：
  - 合并 410/678 行重复规则；封面放大为 `width: min(84vw, 58vh); aspect-ratio: 1`
  - `.hc-p-spacer` 加 `max-height: 48px`，空隙不再随屏幕高度无限膨胀
  - `.hc-p-body` 高度用 `height: 100dvh` 并保留 `100%` 回退，规避 Android WebView 视口差异
- 验收标准：16:9 与 21:9 真机/模拟器上，封面底边到进度条顶边间距 ≤ 64px；歌词模式、沉浸模式不受影响

## 工作流 9：应用图标流水线（已完成）

- 源图 `src-tauri/icons/app-icon.png`（1024×1024，黑色圆角方块 + 白色音符，圆角外透明）已由用户提供的照片裁切生成；`npx tauri icon` 已执行，桌面全套与 Android 全套图标均已更新（本项已完成）
- 实测修正：Android 图标由 CLI 直接写入 `src-tauri/gen/android/app/src/main/res/mipmap-*/`（构建实际使用的位置）；`src-tauri/icons/android/` 下同名文件是旧版 CLI 遗留（时间戳 8/31），实施阶段可删除避免混淆
- 后续换图标流程：替换 `src-tauri/icons/app-icon.png` → 重跑 `npx tauri icon` → 重新构建；在 README 记录该流程

## 测试计划

1. `tsc -b` + `npm run build` 零错误
2. 浏览器 dev（`npm run dev`）：搜索/播放/歌词/AI/Supabase 登录全部回归（走 vite 代理路径）
3. `tauri dev`（桌面 webview）：同上回归（走直连路径），确认 `isTauri` 分支正确
4. `tauri build` NSIS 安装包：安装后断网启动——本地歌单、模拟时钟播放可用；联网后音源/封面/AI 恢复；下载弹另存为
5. `tauri android build` apk：真机验证播放、AI 流式输出、下载落盘 Download 目录、FullPlayer 布局（16:9 与 21:9 各一台或模拟器）、桌面图标为用户指定图
6. Joox 搜索任意港台歌曲：曲名/歌手/歌词为简体

## 非目标

- 不引入任何服务端/线上依赖
- 不更换前端构建工具（vite 仅作打包器保留）
- 不做 git init / 密钥轮换（上一轮分析已建议，另行执行）
- 不处理 iOS

## 风险与备注

- WebCrypto `AES-CBC` 与 Node `createCipheriv` 行为一致（PKCS#7），`crypto.subtle` 在 Tauri webview 与现代浏览器均可用
- `plugin-http` 流式响应：SSE 不经前端直连（AI 已走 Rust Channel），音乐源无流式需求，无风险
- netease 加密只有一份实现（`weapi.ts`）；分流的只是传输层（Rust 命令 vs dev 中间件），两者返回同构 `{body, cookies}` 信封
- 项目当前不是 git 仓库，设计文档无法 commit；建议实施前先 `git init` 并补 `.gitignore`（`src-tauri/target/`、`src-tauri/gen/android` 构建产物、`.aurora-auth.json`）
