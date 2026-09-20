# Flyme Music

一款具有 **Xiaomi HyperOS 设计语言**、融合现代音乐播放器体验的高级音乐应用。

> HyperOS + 现代音乐播放器 + 高级简约 + 轻量 Liquid Glass

> **关于命名**：产品名是 **Flyme Music**。项目历史上曾改名为 Aurora Music，现已改回；**显示文案已全部改回 Flyme Music**，但下列**标识符故意保持 `aurora-*` 不变**，因为它们承载用户数据或应用身份，改了会丢数据或变成另一个应用：
>
> | 标识 | 位置 | 不改的原因 |
> | --- | --- | --- |
> | `aurora.*` localStorage 键（25 个） | 主题、收藏、播放历史、歌词偏移、AI 配置等 | 改键名 = 用户设置与收藏全部清空 |
> | `aurora-local` / `aurora-analysis` 等 IndexedDB 库名 | 本地导入的音乐、音频特征索引 | 改库名 = 本地曲库丢失 |
> | `com.flyme.music` | Tauri / Android 包名 | 与品牌一致，无需改动 |
> | `aurora-music` | `package.json` name | 构建产物与包管理标识 |
> | `aurora-music` / `aurora-backup-*` | 备份文件标记（`src/utils/backup.ts`） | 改标记 = 旧备份无法导入；两种标记目前都能导入 |
> | `--am-*` / `.am-*` | 设计系统令牌与类名 | 全站内部命名，改了无用户可见收益 |
>
> 若将来确实要一并改这些，需要**同时写数据迁移**（读旧键→写新键→删旧键），不能只改字符串。
>
> **部署**：Cloudflare Pages 项目名 `flyme-music`（访问域名 `flyme-music.pages.dev`）—— 与产品名一致，无需改动。

## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

## 打包成独立应用

```bash
npm install
npm run tauri:build            # Windows 安装包（NSIS），产物在 src-tauri/target/release/bundle/nsis
npm run tauri:build:android    # Android apk/aab，需要 Android SDK/NDK 与 JAVA_HOME
```

打包后的应用不依赖 vite dev server，也不依赖任何线上后端：

- 音乐源请求经 Tauri 的 Rust 层直连（绕过 CORS）
- AI 的 endpoint/key/model 在编译期从 `.env.local` 内嵌进 Rust，前端拿不到 key
- 下载由 Rust 直接写盘：桌面弹另存为，Android 存到应用的 Download/FlymeMusic 目录

纯浏览器开发（`npm run dev`）仍然可用：vite 中间件提供 /api/netease/weapi、/api/proxy、/api/img、/api/media-proxy、/api/ai。

> **⚠️ 分发安装包前必读：AI key 会被明文烤进二进制**
>
> `src-tauri/build.rs` 会把 `.env.local` 里的 `AURORA_AI_API_KEY` 编译进程序，构建时会打印：
> `Embedding AURORA_AI_API_KEY into the binary (extractable)`
>
> "前端拿不到 key" 只意味着页面 JS 读不到，**不代表外人读不到**。实测可以直接从
> `app.exe` 里 grep 出这个 key —— 任何拿到安装包的人都能提取。
>
> 若要对外分发，二选一：
> 1. 给这个 key 设严格的消费上限（推荐，桌面端 AI 仍可用）
> 2. 清空 `.env.local` 里的 key 再重新构建（桌面端 AI 失效）

### 在 Git Bash 里构建（Windows）

`tauri build` 需要 MSVC 环境，Git Bash 默认没有，会依次报三种错。构建前先补环境：

```bash
mv dist .dsh/tmp-dist 2>/dev/null   # dist 已存在时 vite 清空目录会被拦截，先移走

export PATH="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64:$PATH"
export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64"

npm run tauri:build
```

三个坑分别对应：`/usr/bin/link`（GNU coreutils）抢在 MSVC 的 `link.exe` 前面；
Windows SDK 的 `kernel32.lib` / `OleAut32.lib` 找不到（缺 `LIB`，且必须用反斜杠）；
以及上面那条 `dist` 已存在的问题。有 Visual Studio 的“x64 Native Tools 命令提示符”时可直接构建，无需这些。

### 已知限制

- Android 下载写入应用专属目录（作用域存储），文件管理器路径为 Android/data/com.flyme.music/files/Download/FlymeMusic；写入公共 Download 需要 MediaStore，属后续增强
- 打包应用内取消 AI 请求只会停止前端渲染，Rust 侧的上游请求会自然结束
- 应用图标源图固定为 src-tauri/icons/app-icon.png，换图标必须重跑 npx tauri icon
- 打包应用内经 plugin-http 发出的请求会带上 Origin: http://tauri.localhost（Windows）或 tauri://localhost（macOS/Linux/Android），这是 Rust 侧强制注入的，无法移除；线上 /api 端点已把这两个 Origin 加入白名单

## 部署网页版到 Cloudflare Pages（flyme-music.pages.dev）

线上网页版部署在 Cloudflare Pages。后端由 `functions/api/` 下的 Pages Functions 提供（Workers 运行时，逻辑与 `server/auroraApi.ts` 同源）：`/api/proxy`、`/api/img`、`/api/media-proxy`、`/api/netease/weapi`、`/api/ai/*`，在线功能与 `npm run dev` 一致。

### 更新部署（dashboard 拖拽上传，无需 CLI 登录）

1. `npm run build` 构建最新前端
2. `npm run release:cf` 组装上传包（写入 `release-cf/`）

   脚本会拷三份内容：`dist/` 的静态产物、`functions/`，以及 `src/lib/apiGuard.ts`。
   最后一项是**必需**的：`functions/api/_shared.ts` 里有 `import ... from '../../src/lib/apiGuard'`，
   只拷 `dist` + `functions` 会让 Cloudflare 构建报模块无法解析（已实测确认）。
   脚本还会在 `dist/` 落后于 `src/` 或 `functions/` 时直接报错退出，避免把过期后端拖上去。

3. 打开 https://dash.cloudflare.com → Workers & Pages → flyme-music → **Create new deployment**，把 `release-cf` 整个文件夹拖进去上传
4. 部署完成后访问 https://flyme-music.pages.dev 验证

> 手动组装（不推荐，容易漏文件）：
> ```powershell
> Remove-Item release-cf -Recurse -Force -ErrorAction SilentlyContinue
> Copy-Item dist release-cf -Recurse
> Copy-Item functions release-cf\functions -Recurse
> New-Item release-cf\src\lib -ItemType Directory -Force | Out-Null
> Copy-Item src\lib\apiGuard.ts release-cf\src\lib\apiGuard.ts
> ```

### 环境变量（dashboard → flyme-music → Settings → Variables and Secrets）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `AURORA_AI_API_KEY` | ✅ | 智谱 API key，只在函数运行时存在，前端永远拿不到 |
| `AURORA_AI_ENDPOINT` | 可选 | 默认已是 `https://open.bigmodel.cn/api/paas/v4` |
| `AURORA_AI_MODEL` | 可选 | 默认已是 `glm-4-flash` |

修改环境变量后需重新触发一次部署才会生效。本地验证 Functions：`npx wrangler pages dev dist`（配合 `.dev.vars`，已被 gitignore）。

### 备注

- SPA 回退：Pages 对未命中静态文件的路径自动回退 `index.html`（BrowserRouter 深链刷新不会 404）
- 仓库中另有一套 Vercel 版实现（`api/` + `server/auroraApi.ts` + `vercel.json`，见下节），两者逻辑同源，可任选其一作为线上部署

## 部署网页版到 Vercel（备选方案）

网页版把 dev 专用的 `/api/*` 中间件移植成了 Vercel Serverless Functions（逻辑在 `server/auroraApi.ts`，薄封装在 `api/`，路由配置在 `vercel.json`），在线功能与 `npm run dev` 一致：网易 weapi 转发、QQ 系代理、封面图代理、媒体下载代理、AI 透传。前端零改动（浏览器分支本来就打相对路径 `/api/*`）。

### 环境变量（Vercel Dashboard → Settings → Environment Variables）

| 变量 | 作用 | 时机 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase 账号登录 | Build（构建期内嵌） |
| `AURORA_AI_ENDPOINT` | AI 上游，默认 `https://open.bigmodel.cn/api/paas/v4` | Runtime（函数运行时读取） |
| `AURORA_AI_API_KEY` | AI 密钥，**只在函数运行时存在，前端永远拿不到** | Runtime |
| `AURORA_AI_MODEL` | AI 模型名，如 `glm-4-flash` | Runtime |

### 本地验证与部署

```bash
npm run build          # 先本地构建确认无错
npx vercel dev         # 本地模拟 Vercel（含 /api 函数）
npx vercel             # 预览环境部署
npx vercel --prod      # 生产部署
```

`vercel.json` 已配置 SPA 回退 rewrite（`/api/` 与静态资源不受影响，未命中深链回退 `index.html`），浏览器端使用 `BrowserRouter`，刷新深链不会 404。

### 网页功能预期

- 与开发模式完全一致：搜索/榜单/网易歌单/封面/下载/AI 对话均经同源 `/api/*` 函数转发，无 CORS 问题
- AI 密钥仅存于 Vercel 运行时环境变量，浏览器请求不携带、也读不到；`GET /api/ai/status` 只返回 `configured/endpoint/model`
- Supabase 账号登录在网页版直接可用（同源，无需额外配置）

## 更换应用图标

1. 用 1024x1024 的 PNG 覆盖 `src-tauri/icons/app-icon.png`
2. 运行 `npx tauri icon src-tauri/icons/app-icon.png`
3. 重新打包。桌面图标写入 `src-tauri/icons/`，Android 图标写入 `src-tauri/gen/android/app/src/main/res/mipmap-*`

> **PWA 图标**：网页版走的是 `public/favicon.svg`（`sizes: any`）与 `public/flyme-mark.jpg`（1254×1254），
> manifest 里如实声明了这两个文件，没有伪造 192/512 PNG。Chrome / Edge / Android 能正常安装；
> iOS 加到主屏的图标质量一般——放两个真正的 `192x192` 与 `512x512` PNG 到 `public/`，
> 再加进 `vite.config.ts` 的 `manifest.icons` 即可改善。

## 官网落地页

项目采用 Vite 双入口：主应用（`index.html`）与官网落地页（`official.html`）完全隔离、可单独部署。

- 开发访问：`http://localhost:5173/official.html`
- 构建产物：`dist/official.html`（无 React runtime，gzip 后约 5 kB）
- 样式复用 `src/styles/global.css` 的 `--am-*` 设计令牌，源码位于 `src/official/`

## 安全与第三方依赖说明

### AI 密钥

- **网页版**：key 只存在于函数运行时环境变量（`AURORA_AI_API_KEY`），前端拿不到。
- **打包版**：`src-tauri/build.rs` 会把 key 以明文字符串编译进二进制。前端确实看不到，但**拿到安装包的人可以用 `strings` 提取**。因此请把内嵌的 key 当作公开值对待：给它设置消费额度/预算上限，并在安装包流出到你信任范围之外时轮换。彻底的做法是让桌面端也走自建中转服务，而不是下发 key。
- 构建时会输出 `cargo:warning` 提醒这一点。

### `/api` 的同源防护

`src/lib/apiGuard.ts` 的 Origin/Referer 校验是**廉价过滤器，不是鉴权边界**——浏览器之外这两个头完全由客户端控制。因此：

- 回环地址（`localhost` / `127.0.0.1`）只在「请求本身也是从回环地址提供」时才被信任，公网部署不会因为 `Origin: http://localhost` 放行；
- Tauri 客户端来源（`http://tauri.localhost`、`tauri://localhost`）始终放行；
- 额外来源用 `AURORA_ALLOWED_ORIGINS`（逗号分隔）配置；
- **务必在 Cloudflare / Vercel 控制台为 `/api/ai` 配置平台级 Rate Limiting**，代码里的限流只在单个 isolate 内存中生效，多实例下不构成硬保证。

### 第三方音源

在线播放/搜索默认走第三方聚合接口 `https://music-api.gdstudio.xyz/api.php`（见 `src/music/source/api-config.ts`）。它不是官方接口，存在**可用性单点、隐私（查询经第三方）、版权**三重风险，并且用户可在设置页自行替换。生产使用前建议替换为自建或官方授权音源。

此外还有一个 **Hi歌（higequ.com）** 音源（见 `src/music/higequ/`）。它同样不是官方接口：站点没有 JSON API，全部靠抓取 PHP 渲染的 HTML 解析（搜索页 `.result-item[data-rid]`、播放页内联 base64 直链与 `.lyric-line` 歌词），**站点改版会直接导致解析失效**，且解析出的音频直链来自第三方 CDN。该音源默认只在搜索页出现，不参与自动化的多源聚合（见下方说明），需用户在搜索页手动选择。

- 打包端经 plugin-http 直连（需伪装浏览器 UA，站点会断开非浏览器 UA 的请求）；浏览器端走同源 `/api/proxy`。
- 若要让它参与每日推荐与 AI 找歌的自动多源聚合，需自行改动两处：`src/hooks/useDailyPick.ts` 的源列表，以及 `src/ai/musicSearch.ts` 的并发搜索列表。默认未开启，避免每次启动都自动请求该站点。

### Supabase Edge Function

`account-auth` 持有 service_role key 且能创建账号，CORS 已改为白名单（默认仅允许线上域名、本地开发地址与 Tauri 来源）。如使用自定义域名或预览环境，请设置 `ALLOWED_ORIGINS` 密钥（逗号分隔）。注意非浏览器客户端不受 CORS 约束，真正的兜底是函数内的单 IP 注册节流 + Supabase Dashboard 的 Auth Rate Limits。

## 技术栈

- React 18 + TypeScript
- Vite 6
- Zustand（状态管理）
- React Router 6
- 原生 CSS（设计令牌驱动，无大型 UI 框架）

## 特性

- 🎨 完整 Design System：色彩 / 字体 / 间距 / 圆角 / 阴影 / 动效 统一 Token
- 🌓 从第一天支持的 Light / Dark / 跟随系统 三种主题
- 📱 响应式：移动端底部导航 + 桌面端玻璃 Sidebar
- 🎵 独立 Player Core（Engine / Queue / Controller），与 UI 完全解耦
- 🖼️ 本地渐变封面系统：零网络依赖、零版权风险
- 🎤 沉浸式歌词：高亮、自动滚动、点击跳转
- 🎧 Full Player 动态环境色（根据专辑色调生成背景）
- 🔌 Provider 架构：一行代码切换未来真实音乐服务
- 🔍 五个可搜索音源：网易云 / QQ / 酷我 / Joox / Hi歌（+ 本地曲库）
- 🕘 播放历史：按天分组，可整组重播或清空
- 🧹 存储管理：查看并清理离线音频缓存与封面缓存
- 📲 PWA：可安装到桌面 / 主屏，离线可打开（Service Worker 预缓存应用外壳）
- 🔐 网易云登录 cookie 以 AES-GCM 加密后落盘，不再明文存 localStorage

## 目录结构

```
src/
├── app/              # 应用入口与路由
├── components/       # 应用级组件（卡片/列表/播放器）
├── design-system/    # 设计令牌与基础组件
├── hooks/            # 通用 hooks
├── layouts/          # 应用布局（Sidebar 等）
├── music/            # 音乐数据层（类型/Provider/Service/Mock）
├── pages/            # 页面
├── player/           # 播放器核心（不依赖 UI）
├── store/            # Zustand stores
├── styles/           # 全局主题样式
└── utils/            # 工具函数
```

## 说明

第一阶段使用本地 Mock 数据：歌曲、专辑、艺术家、歌单、歌词均为原创虚构内容；
封面为程序生成的渐变图形；未使用任何受版权保护的音频、图片与品牌资源。
播放引擎在无真实音频源时以模拟时钟推进进度，保证离线完整可交互。

详见 `docs/` 目录：`DESIGN.md`（设计规范）、`ARCHITECTURE.md`（架构）、`ROADMAP.md`（路线图）。
