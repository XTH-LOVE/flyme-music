# 交接提示词：把 Flyme Music 部署到 Vercel（含 /api 后端移植）

> 用途：本会话额度耗尽，把"部署到网页（完整功能 + Vercel）"这项工作交接给另一个 AI 继续。
> 下面整段是给接手 AI 的自包含上下文，已探明的结论无需重做，直接按"待办"实现即可。

## 0. 你现在的角色与总目标

在一个 Tauri + React 音乐应用上，新增一套 Vercel 无服务器后端（把只在 `vite dev` 存在的 `/api/*` 代理中间件移植到生产环境），配上静态前端一起部署到 Vercel，让**网页版**具备与开发模式一致的在线功能。用户已明确选择：**完整功能（补 /api 后端） + Vercel**，目标主机已定，不用再问。

## 1. 项目与环境

- 项目路径：`D:\FlymeMusic`（Windows）。应用名 "Flyme Music"（内部目录 FlymeMusic）。
- 技术栈：Tauri 2 + React 18 + TypeScript + Vite 6 + Zustand + React Router 6。
- 分支：`feat/standalone-packaging`。当前 HEAD：`2466cd4`。
- 无 git remote、无任何托管配置文件（无 wrangler/netlify/vercel.json/`.github`）。`services/` 是空目录。
- 本机工具：`vercel` CLI 已安装；`gh` 已安装；`wrangler`/`netlify` 未安装。**所有主机 token 都未设置**（CLOUDFLARE_API_TOKEN / VERCEL_TOKEN / GITHUB_TOKEN / SUPABASE_ACCESS_TOKEN 全 unset）。→ 最终推上云那一步需要用户交互式 `vercel login` 或提供 token，你无法在无凭证下完成真实部署；请把代码和配置做全、本地验证，最后给用户一条明确的部署命令 + 环境变量清单。
- 后端：Supabase（auth，生产已可用，见 `supabase/functions/account-auth`，项目 ref `hvfqlvpcfosdzfzbgrka`）。

## 2. 已完成的工作（勿重做，勿破坏其绿灯门槛）

独立打包迁移 Task 1–15 **全部完成并提交**：QQ 客户端化 / GD-API 走 transport / 图片 blob 化 / Joox 繁转简(opencc-js) / AI 走 Rust 通道(key 编译期内嵌 build.rs) / 下载落盘 / 删 legacy 账号 / Tauri 配置+CSP+打包 / 移动端布局 / 端到端验证。

刚完成：`.env.local` 里 AI 已从 opencode.ai 换到智谱：
- `AURORA_AI_ENDPOINT=https://open.bigmodel.cn/api/paas/v4`
- `AURORA_AI_MODEL=glm-4-flash`
- `AURORA_AI_API_KEY=<见 .env.local，绝不写进任何文档/提交>`（**绝不打印、绝不提交**；`.env.local` 已在 .gitignore）

门槛基线（每次改完都要保持）：
- `npm run test` → vitest 16/16 绿
- `npx tsc -b --force` → 零错误
- `npm run build` → 产出 `dist/index.html` + `dist/official.html`
- `cargo check`（`cd src-tauri`）→ Finished，无 error

## 3. 核心技术结论（我已替你查证，直接采用）

### 3a. 为什么"纯静态 dist 部署到网页"会坏
浏览器分支所有在线功能打的是**相对路径 `/api/*`**，而这些中间件只在 `vite.config.ts` 的 `configureServer`（dev-only）里注册，`vite build` 不打包，生产无任何接管 → 全 404。只有 Joox 系 GD-API 走绝对公网地址（可能靠对方 CORS 通），只有 Supabase 登录有真实后端。

### 3b. 前端 transport（`src/lib/apiTransport.ts`）
- `isTauri()`：`typeof window!=='undefined' && '__TAURI_INTERNALS__' in window`
- `httpFetch(input, init)`：浏览器 → 直接 `fetch(input,init)`；Tauri → 走 `@tauri-apps/plugin-http`，且 input 必须是绝对 URL。
- **Vercel 上 `isTauri()` 恒为 false → 走相对 `/api/*` → 命中你的函数**。`src/main.tsx` 里 `Router = isTauri()?HashRouter:BrowserRouter`，Vercel 上是 BrowserRouter（history 路由），**所以需要 SPA 回退 rewrite**。
- 结论：**前端零改动**即可对接 Vercel 函数（只要函数路径与下面完全一致）。

### 3c. tsconfig 结构（决定新代码放哪）
`tsc -b` 只 build 两个 project：
- `tsconfig.app.json`：include `src`
- `tsconfig.node.json`：include `["vite.config.ts","vitest.config.ts"]`
→ 放在根级 `api/` 和 `server/` 的 `.ts` **不在任何 include 里，`tsc -b` 根本不编译它们**，因此不会破坏 `npx tsc -b --force` 绿灯。Vercel 自己用 esbuild 编译 `api/`。**不要**把 api/server 塞进这两个 tsconfig。

## 4. 需要移植的 5 个 `/api` 端点（逐条精确逻辑，源自 vite.config.ts）

常量：`PC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'`

所有端点与前端**同源**（Vercel 静态与函数同域），**不需要 CORS 头**。

1. `GET /api/proxy?url=<enc>&referer=<enc>`
   - 校验 url 匹配 `^https?://` 否则 400 'bad url'
   - `fetch(url,{headers:{'User-Agent':PC_USER_AGENT, ...(referer?{Referer:referer}:{})}})`
   - 回 `res.statusCode=upstream.status`；`Content-Type`=上游或 `application/json`；`Cache-Control: no-store`；body=上游 text。
   - 用途：QQ 官方接口（qq-api.ts）。

2. `GET /api/img?url=<enc>`
   - 校验 url；`fetch(url,{headers:{'User-Agent':PC_USER_AGENT, Referer: new URL(url).origin + '/'}})`
   - 非 ok 或无 body → `res.statusCode=upstream.status||502; res.end('upstream error')`
   - `Content-Type`=上游或 `image/jpeg`；`Cache-Control: public, max-age=2592000, immutable`
   - **流式**：`const r=upstream.body.getReader(); for(;;){const{done,value}=await r.read(); if(done)break; res.write(Buffer.from(value));} res.end()`
   - 用途：封面图（imageSource.ts）。

3. `GET /api/media-proxy?url=<enc>`
   - 校验 url；`fetch(url,{headers:{'User-Agent':PC_USER_AGENT, Referer: new URL(url).origin + '/'}})`
   - 非 ok/无 body → 502
   - `Content-Type`=上游或 `application/octet-stream`；有 `content-length` 就透传；`Cache-Control: no-store`
   - 同上**流式**转发字节
   - 用途：下载（download.ts，浏览器分支）。

4. `POST /api/netease/weapi`（加密已在前端 `src/music/netease/weapi.ts` 完成，函数只做转发+cookie 回传）
   - 非 POST → 405
   - 读 body → `JSON.parse` → `{path, form, cookie?}`
   - 校验 `path` 必须以 `/weapi/` 开头且 `form` 为 string，否则 400
   - `fetch('https://music.163.com'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':PC_USER_AGENT,Referer:'https://music.163.com',Origin:'https://music.163.com',Cookie: (typeof cookie==='string'? cookie.replace(/[\r\n]/g,'').slice(0,12000):'')},body:form})`
   - 取文本；把上游 Set-Cookie 归并：`joinSetCookie` = 对 `headers.getSetCookie?.() ?? (get('set-cookie')?[get('set-cookie')]:[])`，每项 `.split(';',1)[0].trim()` 过滤空后 `.join('; ')`
   - `Content-Type: application/json`；回 `JSON.stringify({body:text, cookies: joined?joined.split('; '):[]})`
   - 用途：网易云 weapi。

5. `/api/ai/*`（key 走运行时环境变量，绝不来自前端）
   - 从 `process.env` 读 `AURORA_AI_ENDPOINT`(默认 `https://opencode.ai/zen/v1`)、`AURORA_AI_API_KEY`、`AURORA_AI_MODEL`；endpoint 去尾部 `/`
   - Vercel catch-all 下 `req.url` 是完整路径（如 `/api/ai/chat/completions`），去掉前缀 `/api/ai` 得子路径 `subPath`；空则当作 `/chat/completions`
   - `subPath==='/status'` → 直接回 `{configured:!!apiKey, endpoint, model:configuredModel}`（**不回 key**）
   - 仅允许 `/models`、`/chat/completions`，否则 400 `{error:'unsupported AI path'}`；无 key → 503 `{error:'AI server key is not configured'}`
   - 目标 = endpoint+subPath；读请求 body；`fetch(target,{method: req.method||'GET',headers:{'Content-Type':'application/json','User-Agent':PC_USER_AGENT,Authorization:'Bearer '+apiKey}, body: GET?undefined:body})`
   - 透传 statusCode；`Content-Type`=上游或 `application/json`；`Cache-Control: no-store`；**流式**转发字节（SSE 依赖逐块 flush；Node20 的 Vercel 函数 `res.write` 支持流式响应）
   - 用途：AI 页与 AiCompanion 自动分析。

补充：`imageSource.ts` 浏览器分支还会把 `/api/img?...` 作为 `<img>`/blob 的 src；确认函数返回的图片 Content-Type 正确、可被 `<img>` 加载即可。

## 5. 待办清单（接手 AI 从这里开始动手）

1. **新建 `server/auroraApi.ts`**：导出上面 5 个端点的纯逻辑处理函数，用 Node 类型 `import type { IncomingMessage, ServerResponse } from 'node:http'`，含 `PC_USER_AGENT`、`joinSetCookie`、`readBody(req):Promise<string>`、`parseQuery(req)`（从 `req.url` 取 `?` 后）、`subPathFrom(req)`（Vercel 的 `req.url` 是完整路径，注意与 vite 的相对 req.url 不同）。错误处理与 vite 保持一致。
2. **新建 `api/` 下的薄封装**（每个都 `import { handleX } from '../server/auroraApi'; export default handleX;` 并加 `export const config = { runtime:'nodejs20.x', maxDuration: 60 }`）：
   - `api/proxy.ts`、`api/img.ts`、`api/media-proxy.ts`、`api/netease/weapi.ts`、`api/ai/[...slug].ts`
   - ⚠️ 共享逻辑一律放 `server/`，**不要**把 helper 放进 `api/`（否则 `api/_shared.ts` 会被 Vercel 暴露成路由 `/api/_shared`）。
   - maxDuration 用 60（AI/媒体流式需要；Hobby 上限 60s）。
3. **新建 `vercel.json`**（根级）：
   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "framework": "vite",
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "rewrites": [
       { "source": "/((?!api/).*)", "destination": "/index.html" }
     ]
   }
   ```
   - Vercel 路由顺序：静态文件与 `api/` 函数**先于** rewrite 匹配，所以 `/assets/*`、`/official.html`、`/api/*` 不受该回退影响；只有未命中的客户端深链（如 `/library`）回退到 `/index.html`（配合 BrowserRouter）。
   - 不要给 `/api/` 加回退。
4. **本地无凭证冒烟测试**（不依赖 vercel 登录）：写一个临时 `server/_smoke.mjs`，用 `node:http` 起本地服务，把 `req,res` 直接喂给 `server/auroraApi.ts` 里的 handler（或用 `tsx`/`esbuild` 跑 .ts），逐个验证：
   - `/api/proxy`、`/api/img`、`/api/media-proxy` 能取到 QQ 图/JSON
   - `/api/netease/weapi` 能拿到网易 weapi 返回
   - `/api/ai/status` 返回 configured:true 且不含 key；临时 `export` 智谱 env 后 `/api/ai/chat/completions` 能流式返回（非流式 `stream:false` 也应 OK）
   - 测完删掉临时文件（别提交）。
5. **验证不破坏门槛**：跑 `npm run test`（16/16）、`npx tsc -b --force`（应仍零错误，因为 api/server 不在 include）、`npm run build`（仍产出 dist 双入口）、`cd src-tauri; cargo check`（未动 Rust，应仍绿）。
6. **README 增补网页部署章节**：说明
   - 在 Vercel 项目 **Environment Variables** 里设 `AURORA_AI_ENDPOINT` / `AURORA_AI_API_KEY` / `AURORA_AI_MODEL`（以及确认 Supabase 的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 已作为 build 环境变量）
   - 本地预览：`npm run build && npx vercel dev`（需登录）
   - 部署：`npx vercel`（预览）→ `npx vercel --prod`（生产）
   - 说明 Vercel 上 AI key 是运行时环境变量，前端拿不到，与桌面版 build.rs 编译期内嵌是两套但都"key 不进前端"。
7. **提交**：单独一条 commit，如 `feat: add Vercel serverless API for the web deployment`，add `vercel.json api/ server/ README.md`（别 add `.env.local`、别 add 临时 smoke 文件）。

## 6. 约束（务必遵守）

- 全程用**中文**回复用户。
- 绝不提交/打印 `.env.local` 与任何 key。
- **绝不 `git commit --amend`**；不碰 global git config。若需提交身份：repo 级 `user.name=FlymeMusic` / `user.email=dev@auroramusic.local`。
- 只写 plain JS/TS，不引多余依赖（不要装 `@vercel/node` 之类，用结构化的 Node `IncomingMessage/ServerResponse` 类型即可）。
- 不要动 `src/` 下前端逻辑和 `vite.config.ts` 的 dev 中间件（那是桌面 dev 用，移植是**新增** api/server，不改 vite）。
- 遇到需要架构取舍或计划外的大改，停下来问用户，别擅自扩范围。

## 7. 交付完成的标准

- `api/` + `server/auroraApi.ts` + `vercel.json` 就绪，逻辑与第 4 节一致。
- 四项门槛全绿（test/tsc/build/cargo check）。
- 本地冒烟证明 5 个端点转发正确（尤其 `/api/ai/status` 不回显 key、`/api/ai/chat/completions` 能出结果）。
- 给用户：清晰的部署步骤（登录→设环境变量→`vercel --prod`）+ 需要在 Vercel 配置的环境变量清单 + 网页版功能预期（含仅 Joox/网易/QQ/AI/封面/下载靠新函数、Supabase 登录靠既有后端）。
