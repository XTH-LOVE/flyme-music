# 独立打包（脱离 vite 运行期依赖）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Flyme Music 打包成不依赖 vite dev server 与任何线上后端的 Windows + Android 独立应用，并修复移动端布局、Joox 繁体、移动端下载三个已知问题。

**Architecture:** 前端保留 vite 仅作打包器。新增传输抽象层 isTauri()/httpFetch()：在 Tauri webview 内所有外网请求经 Rust 层（tauri-plugin-http 或专用 command）绕过 CORS；纯浏览器 dev 继续走 vite.config.ts 中间件。网易 weapi 加密只保留前端一份实现，Rust 与中间件都只做“转发预加密表单 + 回传 Set-Cookie”。AI key 由 build.rs 编译期内嵌进 Rust，前端通过 invoke + ipc Channel 拿流式增量。

**Tech Stack:** React 18 + TypeScript + Vite 6 + Zustand；Tauri 2（Rust）+ tauri-plugin-http + tauri-plugin-dialog + reqwest/futures-util；vitest（新增，仅测纯函数）；opencc-js（懒加载，仅 Joox 用）。

**约定：** 所有命令在项目根 d:\AuroraMusic 执行（Rust 相关命令注明 src-tauri）。每个任务结束都提交一次。

---

## 文件结构

新增文件：

| 文件 | 职责 |
|---|---|
| vitest.config.ts | 测试专用配置（不加载 dev 中间件） |
| src/lib/apiTransport.ts | isTauri() / httpFetch() 运行时传输选择 |
| src/lib/apiTransport.test.ts | 传输选择单测 |
| src/music/netease/weapi.ts | weapi 加密唯一实现（WebCrypto AES-CBC + BigInt RSA）+ 访客 cookie |
| src/music/netease/weapi.test.ts | 加密结果与 Node crypto 交叉校验 |
| src/music/netease/neteaseWeapi.ts | 统一调用入口：Tauri 走 Rust command，浏览器走 dev 中间件 |
| src/music/qq/qq-api.ts | QQ 官方榜单/封面/歌词的唯一客户端实现 |
| src/utils/imageSource.ts | fetchImageBlob() / proxiedImageSrc() |
| src/utils/useProxiedImage.ts | direct → proxy → failed 三级回退 hook |
| src/utils/t2s.ts | 懒加载 opencc-js 的 toSimplified() |
| src/utils/t2s.test.ts | 繁转简单测 |
| src/utils/notify.ts + notify.css | 极简 toast（下载结果/错误提示） |
| src/utils/saveBlob.ts | 浏览器侧保存：Web Share 优先，a[download] 回退 |
| src-tauri/src/netease.rs | netease_post 转发命令（回传 Set-Cookie） |
| src-tauri/src/ai.rs | ai_status / ai_models / ai_chat_completions（Channel 流式） |
| src-tauri/src/download.rs | download_and_save / save_image_base64 落盘 |

修改文件：

| 文件 | 改动 |
|---|---|
| .gitignore | 补 target/gen 构建产物、.aurora-auth.json、supabase/.temp |
| package.json | 版本 0.3.0；新增 @tauri-apps/api、@tauri-apps/plugin-http、opencc-js；devDep vitest；scripts test/tauri:build/tauri:build:android |
| vite.config.ts | weapi 中间件改转发预加密表单；新增 /api/proxy；删 qqMusicProxy、auroraAuthProxy |
| src/music/netease/netease-api.ts | callWeapi 改走 neteaseWeapi |
| src/music/netease/netease-auth.ts | 扫码登录从 cookies 组装会话 cookie |
| src/music/charts.ts | 删本地 callWeapi；QQ 部分委托 qq-api.ts |
| src/utils/currentLyric.ts | 网易歌词走 neteaseWeapi |
| src/music/source/provider-utils.ts | fetchWithTimeout 内部改用 httpFetch |
| src/music/source/base-provider.ts | Joox 结果与歌词简体化 |
| src/music/source/providers/qq-provider.ts | 歌词改走 qq-api.ts |
| src/components/ProxyImg.tsx、TrackCover.tsx、player/AmbientBackdrop.tsx | 改用 useProxiedImage |
| src/utils/coverPalette.ts、lyricShare.ts | 取图改 fetchImageBlob；卡片保存走统一落盘 |
| src/ai/aiClient.ts | Tauri 分支：invoke + Channel |
| src/store/useAuthStore.ts | 删 legacy /api/auth 分支 |
| src/utils/download.ts | Tauri 走 download_and_save；浏览器走 saveBlobInBrowser |
| src/components/player/FullPlayer.tsx | 下载错误 toast |
| src/components/player/halcyon.css | 移动端封面/间距布局修复 |
| src-tauri/Cargo.toml、build.rs、src/lib.rs | 依赖、AI 配置内嵌、插件与命令注册 |
| src-tauri/tauri.conf.json | 去掉远程 url、设置 csp、版本 0.3.0 |
| src-tauri/capabilities/default.json | 去 remote，加 http/dialog 权限 |
| src-tauri/gen/android/app/src/main/AndroidManifest.xml | 允许明文 HTTP |
| README.md | 打包命令与图标流程 |

删除：src-tauri/icons/android/（旧版 CLI 遗留，不参与构建，容易误导）

---

### Task 1: 初始化 git 仓库与 .gitignore

后续每个任务都要提交，版本控制必须先行。项目当前不是 git 仓库，且 src-tauri/target/ 有 3.8 GB 构建产物。

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 覆盖 .gitignore**

```
node_modules
dist
*.local
.DS_Store
npm-debug.log*

# Rust / Tauri 构建产物
src-tauri/target
src-tauri/gen/android/.gradle
src-tauri/gen/android/build
src-tauri/gen/android/buildSrc/build
src-tauri/gen/android/buildSrc/.gradle
src-tauri/gen/android/app/build
src-tauri/gen/android/app/.cxx

# 本地账号数据（含密码哈希）
.aurora-auth.json

# supabase CLI 缓存
supabase/.temp
```

- [ ] **Step 2: 初始化仓库并首次提交**

Run: `git init -b main`
Run: `git add .`
Run: `git status --short`
Expected: 清单为源码与图标级别的文件，不含 `src-tauri/target/`、`node_modules/`、`.env.local`。若出现 target 路径说明 .gitignore 未生效，先修再继续。

Run: `git commit -m "chore: initial commit with build artifacts ignored"`

- [ ] **Step 3: 确认敏感文件未入库**

Run: `git ls-files | Select-String -Pattern 'env.local|target/|node_modules'`
Expected: 无输出。

---

### Task 2: 测试基建（vitest）

项目原本没有测试框架，只为纯函数（加密、繁简转换、传输选择）建最小化环境。

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 安装 vitest**

Run: `npm i -D vitest@^2`
Expected: package.json devDependencies 出现 vitest。

- [ ] **Step 2: 创建 vitest.config.ts**

不复用 vite.config.ts，避免测试进程加载 dev 中间件与 Node 加密逻辑。

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 3: package.json 增加脚本**

在 scripts 中加入（保留原有 dev/build/preview）：

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri:build": "tauri build",
    "tauri:build:android": "tauri android build"
```

- [ ] **Step 4: 验证 vitest 可运行**

Run: `npm run test`
Expected: 输出 `No test files found`；关键是 vitest 能启动且配置可解析。

- [ ] **Step 5: 提交**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add vitest for pure-function coverage"
```

---

### Task 3: 传输抽象层 apiTransport

**Files:**
- Create: `src/lib/apiTransport.ts`
- Test: `src/lib/apiTransport.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpFetch, isTauri } from './apiTransport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTauri', () => {
  it('浏览器环境为 false', () => {
    vi.stubGlobal('window', {});
    expect(isTauri()).toBe(false);
  });

  it('注入 __TAURI_INTERNALS__ 后为 true', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isTauri()).toBe(true);
  });
});

describe('httpFetch', () => {
  it('浏览器环境直接走 window.fetch', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', spy);
    const res = await httpFetch('/api/img?url=x');
    expect(spy).toHaveBeenCalledWith('/api/img?url=x', undefined);
    expect(await res.text()).toBe('ok');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- apiTransport`
Expected: FAIL，`Cannot find module './apiTransport'`。

- [ ] **Step 3: 实现 apiTransport.ts**

```ts
/**
 * Runtime transport selection.
 * Inside a Tauri webview every cross-origin request is routed through the
 * Rust core (no CORS, custom headers allowed); in a plain browser the vite
 * dev-server middlewares keep working unchanged.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let tauriFetch: FetchLike | null = null;

/** CORS-free fetch: Tauri -> plugin-http (Rust), browser -> window.fetch. */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    if (!tauriFetch) {
      const mod = await import('@tauri-apps/plugin-http');
      tauriFetch = mod.fetch as unknown as FetchLike;
    }
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
```

- [ ] **Step 4: 安装 JS 侧插件包**

Run: `npm i @tauri-apps/api@^2 @tauri-apps/plugin-http@^2`
Expected: dependencies 出现两个包（Rust 侧注册在 Task 13）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- apiTransport`
Expected: PASS，3 个用例全绿。

- [ ] **Step 6: 类型检查**

Run: `npx tsc -b --force`
Expected: 无输出（零错误）。

- [ ] **Step 7: 提交**

```bash
git add src/lib/apiTransport.ts src/lib/apiTransport.test.ts package.json package-lock.json
git commit -m "feat: add Tauri/browser transport abstraction layer"
```

---

### Task 4: weapi 加密前端化

**Files:**
- Create: `src/music/netease/weapi.ts`
- Test: `src/music/netease/weapi.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WEAPI_IV, WEAPI_NONCE, aesEncryptBase64, buildVisitorCookie, encryptWeapi } from './weapi';

const nodeAes = (text: string, key: string) => {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(WEAPI_IV, 'utf8'));
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
};

describe('aesEncryptBase64', () => {
  it('与 dev 代理使用的 Node crypto 结果一致', async () => {
    const text = '{"s":"search","limit":5}';
    expect(await aesEncryptBase64(text, WEAPI_NONCE)).toBe(nodeAes(text, WEAPI_NONCE));
  });
});

describe('encryptWeapi', () => {
  it('产出 params 与 256 位十六进制 encSecKey', async () => {
    const r = await encryptWeapi({ id: 123, lv: -1 });
    expect(r.params.length).toBeGreaterThan(20);
    expect(r.encSecKey).toMatch(/^[0-9a-f]{256}$/);
  });

  it('可直接编码为 x-www-form-urlencoded 请求体', async () => {
    const r = await encryptWeapi({ id: 1 });
    const form = new URLSearchParams(r);
    expect(form.get('params')).toBe(r.params);
    expect(form.get('encSecKey')).toBe(r.encSecKey);
  });
});

describe('buildVisitorCookie', () => {
  it('带 pc 客户端标记且每次 nuid 不同', () => {
    const a = buildVisitorCookie();
    const b = buildVisitorCookie();
    expect(a).toContain('os=pc');
    expect(a).toContain('_ntes_nuid=');
    expect(a.endsWith('NMTID=0;')).toBe(true);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- weapi`
Expected: FAIL，`Cannot find module './weapi'`。

- [ ] **Step 3: 实现 weapi.ts**

```ts
/**
 * Netease weapi crypto - the single implementation shared by the packaged
 * app and the browser dev flow. Ported from the vite dev middleware; the
 * AES/RSA constants are Netease's public client constants.
 */
export const WEAPI_NONCE = '0CoJUm6Qyw8W8jud';
export const WEAPI_IV = '0102030405060708';
const PUB_KEY = '010001';
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7' +
  'b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280' +
  '104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932' +
  '575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b' +
  '3ece0462db0a22b8e7';

/** Netease's alphabet intentionally omits '8'. */
function randomKey(size: number): string {
  const choice = '012345679abcdef';
  let out = '';
  for (let i = 0; i < size; i += 1) out += choice[Math.floor(Math.random() * choice.length)];
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

/** AES-128-CBC + PKCS#7, matching Node's createCipheriv used by the dev proxy. */
export async function aesEncryptBase64(text: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'AES-CBC', length: 128 },
    false,
    ['encrypt'],
  );
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: enc.encode(WEAPI_IV) },
    cryptoKey,
    enc.encode(text),
  );
  return toBase64(new Uint8Array(buf));
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function rsaEncrypt(secKey: string): string {
  const reversed = new TextEncoder().encode(secKey.split('').reverse().join(''));
  let hex = '';
  reversed.forEach((b) => { hex += b.toString(16).padStart(2, '0'); });
  const enc = modPow(BigInt('0x' + hex), BigInt('0x' + PUB_KEY), BigInt('0x' + MODULUS));
  return enc.toString(16).padStart(256, '0');
}

export interface WeapiPayload {
  params: string;
  encSecKey: string;
}

/** Double-AES + RSA envelope required by every /weapi/ endpoint. */
export async function encryptWeapi(object: unknown): Promise<WeapiPayload> {
  const text = JSON.stringify(object);
  const secKey = randomKey(16);
  const enc1 = await aesEncryptBase64(text, WEAPI_NONCE);
  const enc2 = await aesEncryptBase64(enc1, secKey);
  return { params: enc2, encSecKey: rsaEncrypt(secKey) };
}

/** Body for Content-Type: application/x-www-form-urlencoded. */
export async function weapiForm(object: unknown): Promise<string> {
  const payload = await encryptWeapi(object);
  return new URLSearchParams(payload).toString();
}

/** Anonymous pc-client markers; Netease rejects requests without them. */
export function buildVisitorCookie(): string {
  const nuid = randomKey(32);
  const nnid = nuid + ',' + Date.now();
  return 'os=pc; appver=2.9.7; mode=31; _ntes_nuid=' + nuid + '; _ntes_nnid3=' + nnid + '; NMTID=0;';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- weapi`
Expected: PASS，4 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/music/netease/weapi.ts src/music/netease/weapi.test.ts
git commit -m "feat: port netease weapi crypto to the frontend"
```

---

### Task 5: 网易统一调用入口 + Rust 转发命令

**Files:**
- Create: `src-tauri/src/netease.rs`
- Create: `src/music/netease/neteaseWeapi.ts`
- Modify: `src-tauri/src/lib.rs`（本任务只加 mod 声明，插件与 handler 注册在 Task 13）
- Modify: `src-tauri/Cargo.toml`
- Modify: `src/music/netease/netease-api.ts:11-26`
- Modify: `src/music/netease/netease-auth.ts:13-42`
- Modify: `src/music/charts.ts:9-24`
- Modify: `src/utils/currentLyric.ts:32-50`
- Modify: `vite.config.ts`（删加密函数与常量，重写 neteaseWeapiProxy）

- [ ] **Step 1: 创建 src-tauri/src/netease.rs**

```rust
use serde::Serialize;

pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NeteasePostResult {
  pub body: String,
  pub cookies: Vec<String>,
}

/// Forwards an already-encrypted weapi form. The webview cannot read
/// Set-Cookie, and QR login returns the session only there (code 803).
#[tauri::command]
pub async fn netease_post(path: String, form: String, cookie: String) -> Result<NeteasePostResult, String> {
  if !path.starts_with("/weapi/") {
    return Err("bad path".into());
  }
  let res = reqwest::Client::new()
    .post(format!("https://music.163.com{}", path))
    .header("Content-Type", "application/x-www-form-urlencoded")
    .header("User-Agent", USER_AGENT)
    .header("Referer", "https://music.163.com")
    .header("Origin", "https://music.163.com")
    .header("Cookie", cookie)
    .body(form)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  let cookies: Vec<String> = res
    .headers()
    .get_all("set-cookie")
    .iter()
    .filter_map(|v| v.to_str().ok().map(|s| s.split(';').next().unwrap_or("").trim().to_string()))
    .filter(|s| !s.is_empty())
    .collect();
  let body = res.text().await.map_err(|e| e.to_string())?;
  Ok(NeteasePostResult { body, cookies })
}
```

- [ ] **Step 2: lib.rs 顶部加模块声明**

在 src-tauri/src/lib.rs 最前面插入一行：

```rust
mod netease;
```

- [ ] **Step 3: Cargo.toml 增加依赖**

在 [dependencies] 段追加：

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "stream", "rustls-tls"] }
futures-util = "0.3"
tokio = { version = "1", features = ["sync"] }
```

- [ ] **Step 4: 验证 Rust 编译**

Run: `cd src-tauri; cargo check 2>&1 | Select-Object -Last 15`
Expected: `Finished`；允许出现 “function is never used” 类 warning（命令尚未注册），不允许 error。首次编译耗时数分钟。

- [ ] **Step 5: 创建 src/music/netease/neteaseWeapi.ts**

```ts
import { isTauri } from '@/lib/apiTransport';
import { buildVisitorCookie, weapiForm } from './weapi';

export interface NeteaseResult<T> {
  json: T;
  /** Set-Cookie 首段列表；扫码登录（code 803）只在这里返回会话。 */
  cookies: string[];
}

function composeCookie(userCookie: string): string {
  const visitor = buildVisitorCookie();
  return userCookie ? userCookie + '; ' + visitor : visitor;
}

/**
 * Single entry point for every /weapi/ call. Encryption happens once in
 * weapi.ts; only the transport differs: Tauri -> Rust command, browser dev
 * -> vite middleware. Both return the same { body, cookies } envelope.
 */
export async function neteaseWeapi<T>(
  path: string,
  data: Record<string, unknown>,
  cookie = '',
  signal?: AbortSignal,
): Promise<NeteaseResult<T>> {
  const form = await weapiForm(data);
  const fullCookie = composeCookie(cookie);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const r = await invoke<{ body: string; cookies: string[] }>('netease_post', {
      path,
      form,
      cookie: fullCookie,
    });
    return { json: JSON.parse(r.body) as T, cookies: r.cookies };
  }
  const res = await fetch('/api/netease/weapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, form, cookie: fullCookie }),
    signal,
  });
  if (!res.ok) throw new Error('netease weapi HTTP ' + res.status);
  const envelope = (await res.json()) as { body: string; cookies: string[] };
  return { json: JSON.parse(envelope.body) as T, cookies: envelope.cookies ?? [] };
}
```

- [ ] **Step 6: netease-api.ts 改用它**

把 src/music/netease/netease-api.ts 第 11-26 行（WEAPI_ENDPOINT 常量与旧 callWeapi）替换为：

```ts
import { neteaseWeapi } from './neteaseWeapi';

/**
 * Netease official API client. Encryption lives in weapi.ts; the transport
 * is the Rust command in the packaged app and the vite middleware in dev.
 */
export async function callWeapi<T>(
  path: string,
  data: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { json } = await neteaseWeapi<T>(path, data, useNeteaseAuthStore.getState().cookie, signal);
  return json;
}
```

文件顶部原有的 `import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';` 保留；把新的 import 语句移到文件顶部 import 区（TS 不允许 import 出现在文件中部）。

- [ ] **Step 7: charts.ts 删掉重复实现**

删除 src/music/charts.ts 第 9-24 行（WEAPI_ENDPOINT 与本地 callWeapi），在顶部 import 区加：

```ts
import { callWeapi } from './netease/netease-api';
```

getNeteaseToplists 其余代码不变。

- [ ] **Step 8: currentLyric.ts 改走统一入口**

把 src/utils/currentLyric.ts 第 32-50 行的 neteaseWeapiLyric 替换为：

```ts
/** Direct music.163.com lyric (fast lane, races the GD API). */
async function neteaseWeapiLyric(id: string): Promise<MiniLyricLine[]> {
  try {
    const { json } = await neteaseWeapi<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>(
      '/weapi/song/lyric',
      { id, lv: -1, tv: -1, kv: -1 },
    );
    const lrc = json?.lrc?.lyric;
    if (!lrc) return [];
    return mergeLines(parseLrc(lrc), json?.tlyric?.lyric ? parseLrc(json.tlyric.lyric) : []);
  } catch {
    return [];
  }
}
```

顶部 import 区加：

```ts
import { neteaseWeapi } from '@/music/netease/neteaseWeapi';
```

- [ ] **Step 9: netease-auth.ts 用 cookies 组装会话**

把 src/music/netease/netease-auth.ts 第 13-42 行（callAuth、getNeteaseQrKey、NeteaseQrStatus、checkNeteaseQr）替换为：

```ts
import { neteaseWeapi } from './neteaseWeapi';

async function callAuth<T>(path: string, data: Record<string, unknown>, cookie = ''): Promise<T> {
  const { json } = await neteaseWeapi<T>(path, data, cookie);
  return json;
}

export async function getNeteaseQrKey(): Promise<string> {
  const response = await callAuth<QrKeyResponse>('/weapi/login/qrcode/unikey', { type: 1 });
  if (response.code !== 200 || !response.unikey) throw new Error('获取登录二维码失败');
  return response.unikey;
}

export interface NeteaseQrStatus {
  code: number;
  cookie?: string;
  message?: string;
  data?: { cookie?: string };
}

/** code 803 = 扫码成功，会话只在 Set-Cookie 里。 */
export async function checkNeteaseQr(key: string): Promise<NeteaseQrStatus> {
  const { json, cookies } = await neteaseWeapi<NeteaseQrStatus>(
    '/weapi/login/qrcode/client/login',
    { key, type: 1, csrf_token: '' },
  );
  if (json.code === 803 && cookies.length && typeof json.cookie !== 'string') {
    return { ...json, cookie: cookies.join('; ') };
  }
  return json;
}
```

同样把 import 语句放到文件顶部 import 区。

- [ ] **Step 10: vite 中间件改为转发预加密表单**

把 vite.config.ts 的 neteaseWeapiProxy()（原第 143-208 行）整体替换为：

```ts
/** Dev-only forwarder: the browser cannot POST to music.163.com (CORS) nor
 * read Set-Cookie. Encryption already happened in src/music/netease/weapi.ts. */
function neteaseWeapiProxy(): Plugin {
  return {
    name: 'aurora-netease-weapi-proxy',
    configureServer(server) {
      server.middlewares.use('/api/netease/weapi', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method not allowed' }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { path: apiPath, form, cookie } = JSON.parse(body) as {
              path: string;
              form: string;
              cookie?: string;
            };
            if (!apiPath || !apiPath.startsWith('/weapi/') || typeof form !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'bad path or form' }));
              return;
            }
            const upstream = await fetch('https://music.163.com' + apiPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': PC_USER_AGENT,
                Referer: 'https://music.163.com',
                Origin: 'https://music.163.com',
                Cookie: typeof cookie === 'string' ? cookie.replace(/[\r\n]/g, '').slice(0, 12000) : '',
              },
              body: form,
            });
            const text = await upstream.text();
            const joined = getResponseCookie(upstream.headers);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ body: text, cookies: joined ? joined.split('; ') : [] }));
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}
```

同时删除 vite.config.ts 中已无调用者的加密代码：NONCE、IV、PUB_KEY、MODULUS 常量与 createSecretKey、aesEncrypt、modPow、rsaEncrypt、weapi、buildVisitorCookie（原第 14-74 行），并移除不再需要的 `import crypto from 'node:crypto';`（若 Task 12 删除 auroraAuthProxy 后 fs/path 仍被 alias 使用，则 path 保留、fs 一并移除）。保留 PC_USER_AGENT 与 getResponseCookie。

- [ ] **Step 11: 类型检查**

Run: `npx tsc -b --force`
Expected: 无输出。

- [ ] **Step 12: 浏览器 dev 回归**

Run: `npm run dev`，打开 http://localhost:5173
验证三件事：搜索一首歌、打开榜单页（网易 toplist）、播放网易歌曲并展开歌词。
Expected: 数据正常；DevTools Network 中 /api/netease/weapi 的响应体形如 `{"body":"{\"code\":200,...}","cookies":[]}`。

- [ ] **Step 13: 提交**

```bash
git add src-tauri/src/netease.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/music/netease/neteaseWeapi.ts src/music/netease/netease-api.ts src/music/netease/netease-auth.ts src/music/charts.ts src/utils/currentLyric.ts vite.config.ts
git commit -m "feat: unify netease weapi transport behind one crypto implementation"
```

---

### Task 6: QQ 官方接口客户端化

**Files:**
- Create: `src/music/qq/qq-api.ts`
- Modify: `src/music/charts.ts:100-188`
- Modify: `src/music/source/providers/qq-provider.ts:51-61`
- Modify: `vite.config.ts`（新增 genericProxy，删除 qqMusicProxy）

- [ ] **Step 1: 创建 src/music/qq/qq-api.ts**

```ts
import { httpFetch, isTauri } from '@/lib/apiTransport';
import type { MusicTrack } from '../source/types';

/**
 * QQ Music official endpoints - the single client implementation.
 * Packaged app: plugin-http with an explicit Referer. Browser dev: the
 * generic /api/proxy middleware (QQ rejects wrong referers and sends no
 * CORS headers).
 */
const QQ_REFERER = 'https://y.qq.com/';
const QQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchQqText(url: string, signal?: AbortSignal): Promise<string> {
  const res = isTauri()
    ? await httpFetch(url, { headers: { Referer: QQ_REFERER, 'User-Agent': QQ_UA }, signal })
    : await fetch(
        '/api/proxy?url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(QQ_REFERER),
        { signal },
      );
  if (!res.ok) throw new Error('qq HTTP ' + res.status);
  return (await res.text()).replace(/^\uFEFF/, '');
}

interface MusicuDetail {
  detail?: {
    data?: {
      data?: {
        title?: string;
        song?: { title?: string; singerName?: string; cover?: string }[];
      };
    };
  };
}

interface LegacyChartSong {
  data?: {
    songid?: number;
    songmid?: string;
    songname?: string;
    interval?: number;
    albumname?: string;
    albummid?: string;
    singer?: { name?: string }[];
  };
}

interface LegacyChart {
  songlist?: LegacyChartSong[];
  topinfo?: { ListName?: string; info?: string };
  date?: string;
  total_song_num?: number;
}

const legacyChartUrl = (topId: number) =>
  'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&type=top&topid=' + topId;

async function fetchLegacyChart(topId: number, signal?: AbortSignal): Promise<LegacyChart> {
  return JSON.parse(await fetchQqText(legacyChartUrl(topId), signal)) as LegacyChart;
}

export interface QqChartTop {
  title: string;
  topSong: string;
  topSinger: string;
  cover: string;
}

/** 榜单头名信息（含第一首有封面的歌，用于榜单卡片）。 */
export async function getQqChartTop(topId: number, signal?: AbortSignal): Promise<QqChartTop> {
  const payload = JSON.stringify({
    detail: {
      module: 'musicToplist.ToplistInfoServer',
      method: 'GetDetail',
      param: { topId, offset: 0, num: 5 },
    },
  });
  const json = JSON.parse(
    await fetchQqText('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(payload), signal),
  ) as MusicuDetail;
  const d = json.detail?.data?.data;
  const songs = d?.song ?? [];
  let cover = (songs.find((s) => s.cover)?.cover ?? '').replace(/^http:/, 'https:');
  if (!cover) {
    try {
      const legacy = await fetchLegacyChart(topId, signal);
      const mid = (legacy.songlist ?? []).map((s) => s.data?.albummid).find((m) => Boolean(m));
      if (mid) cover = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + mid + '.jpg';
    } catch {
      /* keep empty */
    }
  }
  return {
    title: d?.title ?? '',
    topSong: songs[0]?.title ?? '',
    topSinger: songs[0]?.singerName ?? '',
    cover,
  };
}

export interface QqChartDetail {
  meta: {
    topId: number;
    title: string;
    titleDetail: string;
    period: string;
    intro: string;
    totalNum: number;
  };
  tracks: MusicTrack[];
}

/** 榜单详情（旧版接口，含 songmid / 时长 / 歌手 / 专辑）。 */
export async function getQqChartDetail(topId: number, signal?: AbortSignal): Promise<QqChartDetail> {
  const json = await fetchLegacyChart(topId, signal);
  if (!json.songlist) throw new Error('qq chart data missing');

  const tracks: MusicTrack[] = json.songlist
    .map((item) => item.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d && d.songmid))
    .map((d) => ({
      id: String(d.songid),
      name: d.songname ?? '',
      artist: (d.singer ?? []).map((s) => s.name ?? '').filter(Boolean),
      album: d.albumname ?? '',
      pic_id: d.albummid ?? String(d.songid),
      url_id: d.songmid ?? '',
      lyric_id: d.songmid ?? '',
      source: 'qq',
      duration: d.interval ?? 0,
      picUrl: d.albummid
        ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + d.albummid + '.jpg'
        : undefined,
    }));

  return {
    meta: {
      topId,
      title: json.topinfo?.ListName ?? '',
      titleDetail: json.topinfo?.ListName ?? '',
      period: json.date ?? '',
      intro: (json.topinfo?.info ?? '').replace(/<br>/g, ' '),
      totalNum: json.total_song_num ?? tracks.length,
    },
    tracks,
  };
}

/** 歌词（LRC 明文）。 */
export async function getQqLyric(
  mid: string,
  signal?: AbortSignal,
): Promise<{ lyric: string; trans: string }> {
  if (!mid) return { lyric: '', trans: '' };
  const json = JSON.parse(
    await fetchQqText(
      'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' +
        encodeURIComponent(mid) +
        '&format=json&nobase64=1&g_tk=5381',
      signal,
    ),
  ) as { lyric?: string; trans?: string };
  return { lyric: json.lyric ?? '', trans: json.trans ?? '' };
}
```

- [ ] **Step 2: charts.ts 改为委托**

删除 src/music/charts.ts 中的 `QqChartTop` 接口、`getQqChartTop`、`QqChartDetail` 接口、`RawQqLegacySong`、`RawQqLegacyChart`、`getQqChartDetail`（原第 100-188 行），改为在文件末尾追加一行再导出，保持既有页面的 import 不变：

```ts
export { getQqChartTop, getQqChartDetail } from './qq/qq-api';
export type { QqChartTop, QqChartDetail } from './qq/qq-api';
```

`QQ_CHARTS` 与 `QqChartConfig` 保留在 charts.ts。

- [ ] **Step 3: qq-provider.ts 歌词改走 qq-api**

把 src/music/source/providers/qq-provider.ts 的 getLyric（第 51-61 行）替换为：

```ts
  /** Lyrics still come from QQ official (real LRC). */
  async getLyric(track: MusicTrack): Promise<SongLyric | null> {
    try {
      const { lyric, trans } = await getQqLyric(track.url_id);
      return { lyric, tlyric: trans };
    } catch {
      return null;
    }
  }
```

顶部 import 区加：

```ts
import { getQqLyric } from '../../qq/qq-api';
```

- [ ] **Step 4: vite.config.ts 新增通用代理、删除 QQ 中间件**

新增插件（放在 imageProxy 之前即可）：

```ts
/** Dev-only generic forwarder with a caller-supplied Referer. The packaged
 * app uses plugin-http instead, so this never ships. */
function genericProxy(): Plugin {
  return {
    name: 'aurora-generic-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        const target = parsed.searchParams.get('url');
        const referer = parsed.searchParams.get('referer') ?? '';
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: {
              'User-Agent': PC_USER_AGENT,
              ...(referer ? { Referer: referer } : {}),
            },
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}
```

删除整个 `qqMusicProxy()` 函数，并把 plugins 数组改为：

```ts
  plugins: [react(), genericProxy(), neteaseWeapiProxy(), imageProxy(), mediaDownloadProxy(), aiProxy(env)],
```

（auroraAuthProxy 在 Task 12 删除。）

- [ ] **Step 5: 类型检查 + dev 回归**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，打开榜单页并进入任一 QQ 榜单，再播放一首 QQ 歌曲看歌词。
Expected: 榜单曲目与封面正常；Network 中出现 `/api/proxy?url=https%3A%2F%2Fu.y.qq.com...`；歌词正常显示。

- [ ] **Step 6: 提交**

```bash
git add src/music/qq/qq-api.ts src/music/charts.ts src/music/source/providers/qq-provider.ts vite.config.ts
git commit -m "feat: move QQ official endpoints into a single client implementation"
```

---

### Task 7: GD-API（Joox/搜索源）走 CORS-free 通道

**Files:**
- Modify: `src/music/source/provider-utils.ts:1-8,67-86`

- [ ] **Step 1: fetchWithTimeout 内部改用 httpFetch**

顶部 import 区加：

```ts
import { httpFetch } from '@/lib/apiTransport';
```

把 fetchWithTimeout 的签名与最后一行改为（其余逻辑不动）：

```ts
export function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT_MS,
): Promise<Response> {
```

```ts
  return httpFetch(input, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  });
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --force`
Expected: 无输出。

- [ ] **Step 3: dev 回归**

Run: `npm run dev`，把音源切到 Joox 搜索一首歌并播放。
Expected: 搜索与播放正常（浏览器路径未变，只是多了一层 httpFetch 转发）。

- [ ] **Step 4: 提交**

```bash
git add src/music/source/provider-utils.ts
git commit -m "feat: route GD-API requests through the transport layer"
```

---

### Task 8: 图片通道（blob 化）

**Files:**
- Create: `src/utils/imageSource.ts`
- Create: `src/utils/useProxiedImage.ts`
- Modify: `src/components/ProxyImg.tsx`
- Modify: `src/components/TrackCover.tsx:24,62-79`
- Modify: `src/components/player/AmbientBackdrop.tsx`
- Modify: `src/utils/coverPalette.ts:21-28`
- Modify: `src/utils/lyricShare.ts`（取封面段）

- [ ] **Step 1: 创建 src/utils/imageSource.ts**

```ts
import { httpFetch, isTauri } from '@/lib/apiTransport';

/**
 * Artwork bytes. CDNs block hotlinks and taint cross-origin canvases, so
 * palette extraction and lyric cards both need the bytes, not just a URL.
 */
export async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const res = isTauri()
      ? await httpFetch(url, { headers: { Referer: new URL(url).origin + '/' } })
      : await fetch('/api/img?url=' + encodeURIComponent(url));
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

const blobCache = new Map<string, string>();
const BLOB_CACHE_MAX = 200;

/** <img src> for the proxy stage: blob URL in Tauri, dev proxy in browser. */
export async function proxiedImageSrc(url: string): Promise<string | null> {
  if (!isTauri()) return '/api/img?url=' + encodeURIComponent(url);
  const hit = blobCache.get(url);
  if (hit) return hit;
  const blob = await fetchImageBlob(url);
  if (!blob) return null;
  const objectUrl = URL.createObjectURL(blob);
  if (blobCache.size >= BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value as string | undefined;
    if (oldest) {
      const stale = blobCache.get(oldest);
      blobCache.delete(oldest);
      if (stale) URL.revokeObjectURL(stale);
    }
  }
  blobCache.set(url, objectUrl);
  return objectUrl;
}
```

- [ ] **Step 2: 创建 src/utils/useProxiedImage.ts**

```ts
import { useEffect, useState } from 'react';
import { initialImgStage, markDirectFailed } from './imgFallback';
import { proxiedImageSrc } from './imageSource';

export type ImageStage = 'direct' | 'proxy' | 'failed';

/**
 * Resilience chain for remote artwork: direct CDN first, proxied (blob in
 * the packaged app, /api/img in dev) second, gradient placeholder last.
 */
export function useProxiedImage(url: string | null | undefined) {
  const [stage, setStage] = useState<ImageStage>(() => initialImgStage(url) as ImageStage);
  const [proxySrc, setProxySrc] = useState<string | null>(null);

  useEffect(() => {
    setStage(initialImgStage(url) as ImageStage);
    setProxySrc(null);
  }, [url]);

  useEffect(() => {
    if (stage !== 'proxy' || !url) return undefined;
    let alive = true;
    void proxiedImageSrc(url).then((src) => {
      if (!alive) return;
      if (src) setProxySrc(src);
      else setStage('failed');
    });
    return () => {
      alive = false;
    };
  }, [stage, url]);

  const onError = () => {
    if (stage === 'direct') {
      markDirectFailed(url);
      setStage('proxy');
    } else {
      setStage('failed');
    }
  };

  const src = stage === 'direct' ? url ?? null : stage === 'proxy' ? proxySrc : null;
  return { src, stage, onError };
}
```

- [ ] **Step 3: ProxyImg.tsx 改用 hook**

整文件替换为：

```tsx
import { useProxiedImage } from '@/utils/useProxiedImage';

interface ProxyImgProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * <img> with a resilience chain: direct CDN load first; on failure retry
 * through the proxy (blob URL in the packaged app, /api/img in dev); if
 * that also fails the element disappears so the gradient fallback shows.
 */
export function ProxyImg({ src, alt = '', className, style }: ProxyImgProps) {
  const { src: resolved, stage, onError } = useProxiedImage(src);

  if (!src || !resolved) return null;

  return (
    <img
      key={stage + resolved}
      className={className}
      style={style}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={resolved}
      onError={onError}
    />
  );
}
```

- [ ] **Step 4: TrackCover.tsx 改用 hook**

删除 `useState` 的 `stage`、`loaded` 中与 stage 相关的部分改为使用 hook。把第 23-24 行替换为：

```tsx
  const [url, setUrl] = useState<string | null>(withPicSize(track.picUrl, '300y300') || null);
  const { src: imgSrc, stage, onError } = useProxiedImage(url);
  const [loaded, setLoaded] = useState(false);
```

useEffect 中删除 `setStage(initialImgStage(track.picUrl));` 一行（stage 由 hook 管理）。

把 `const showImg = Boolean(url) && stage !== 'failed';` 改为：

```tsx
  const showImg = Boolean(imgSrc) && stage !== 'failed';
```

把 img 元素（第 62-79 行）替换为：

```tsx
      {showImg && imgSrc ? (
        <img
          key={stage + imgSrc}
          className="track-cover-img"
          src={imgSrc}
          alt={title ?? track.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={onError}
          onLoad={() => setLoaded(true)}
        />
      ) : null}
```

import 区：删除 `initialImgStage, markDirectFailed`（保留 `withPicSize`），加入 `import { useProxiedImage } from '@/utils/useProxiedImage';`。

- [ ] **Step 5: AmbientBackdrop.tsx 改用 hook**

把 BgImage 组件替换为：

```tsx
/** Blurred cover image with direct -> proxy fallback. */
function BgImage({ track }: { track: MusicTrack }) {
  const url = withPicSize(track.picUrl, '768y768');
  const { src, stage, onError } = useProxiedImage(url);
  if (!src || stage === 'failed') return null;
  return (
    <img
      key={stage + src}
      className="fp-bg__img"
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
```

import 区：删除 `initialImgStage, markDirectFailed`（保留 `withPicSize`），加入 `import { useProxiedImage } from '@/utils/useProxiedImage';`。

- [ ] **Step 6: coverPalette.ts 取图改 fetchImageBlob**

把 extract 中第 23-28 行替换为：

```ts
    const src = withPicSize(picUrl, '300y300') || picUrl;
    // Bytes (not a URL) keep the canvas readable: CDNs block cross-origin
    // pixel reads, and hotlinking fails outright without a Referer.
    const blob = await fetchImageBlob(src);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
```

import 区加：`import { fetchImageBlob } from './imageSource';`

- [ ] **Step 7: lyricShare.ts 取封面改 fetchImageBlob**

把加载封面那段（`const img = new Image();` 到 `img.src = '/api/img?...'` 的 Promise）替换为：

```ts
      const blob = await fetchImageBlob(pic);
      if (!blob) throw new Error('cover');
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img'));
        img.src = objectUrl;
      });
```

并把封面加载段整体改成下面的写法（objectUrl 声明在 try 外，finally 中统一释放）。原 `const img = new Image();` 到 `img.src = '/api/img?url=' + encodeURIComponent(pic);` 的 Promise 段替换为：

```ts
    } catch {
      /* no cover - text-only card */
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
```

实现要求：`let objectUrl = '';` 声明在 `if (pic) {` 之后、`try` 之前；try 内先 `const blob = await fetchImageBlob(pic);`，再 `if (!blob) throw new Error('cover');`，然后 `objectUrl = URL.createObjectURL(blob);`；catch 块保持 `/* no cover - text-only card */` 不变。

import 区加：`import { fetchImageBlob } from './imageSource';`

- [ ] **Step 8: 类型检查 + dev 回归**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，检查首页推荐歌单封面、搜索页封面、播放页背景与动态色、歌词卡片分享。
Expected: 封面正常显示；播放器背景色随封面变化；分享能下载卡片图片。

- [ ] **Step 9: 提交**

```bash
git add src/utils/imageSource.ts src/utils/useProxiedImage.ts src/components/ProxyImg.tsx src/components/TrackCover.tsx src/components/player/AmbientBackdrop.tsx src/utils/coverPalette.ts src/utils/lyricShare.ts
git commit -m "feat: load artwork through the transport layer with blob caching"
```

---

### Task 9: Joox 繁体转简体

**Files:**
- Create: `src/utils/t2s.ts`
- Test: `src/utils/t2s.test.ts`
- Modify: `src/music/source/base-provider.ts:11-52`

- [ ] **Step 1: 安装 opencc-js**

Run: `npm i opencc-js`
Expected: dependencies 出现 opencc-js。

- [ ] **Step 2: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { toSimplified } from './t2s';

describe('toSimplified', () => {
  it('把常见繁体词转成简体', async () => {
    expect(await toSimplified('愛情的模樣')).toBe('爱情的模样');
  });

  it('保留数字、标点与英文', async () => {
    expect(await toSimplified('Live 2024！')).toBe('Live 2024！');
  });

  it('空字符串直接返回', async () => {
    expect(await toSimplified('')).toBe('');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm run test -- t2s`
Expected: FAIL，`Cannot find module './t2s'`。

- [ ] **Step 4: 实现 src/utils/t2s.ts**

```ts
/**
 * Traditional -> Simplified conversion for Joox metadata and lyrics.
 * The dictionary chunk is imported lazily: only Joox content pays for it.
 */
type Converter = (text: string) => string;

let converter: Converter | null = null;
let loading: Promise<void> | null = null;

async function ensureConverter(): Promise<void> {
  if (converter) return;
  loading ??= import('opencc-js').then((mod) => {
    converter = mod.Converter({ from: 'tw', to: 'cn' }) as Converter;
  });
  await loading;
}

export async function toSimplified(text: string): Promise<string> {
  if (!text) return text;
  try {
    await ensureConverter();
  } catch {
    return text;
  }
  return converter ? converter(text) : text;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- t2s`
Expected: PASS，3 个用例全绿。

- [ ] **Step 5b: 补 opencc-js 类型声明**

新建 `src/types/opencc-js.d.ts`（若 opencc-js 自带类型导致重复声明报错，则删除此文件，以 `npx tsc -b --force` 结果为准）：

```ts
declare module 'opencc-js' {
  export function Converter(options: {
    from: string;
    to: string;
    segment?: boolean;
  }): (text: string) => string;
}
```

Run: `npx tsc -b --force`
Expected: 无输出。

- [ ] **Step 6: base-provider.ts 接入**

顶部 import 区加：

```ts
import { toSimplified } from '@/utils/t2s';
```

把 search 方法体（第 17-22 行）替换为：

```ts
    const json = await requestMusicApiJSON<RawApiTrack[]>(
      { types: 'search', source: this.source, name: query, count, pages: page },
      signal,
    );
    let items = json.map((t) => normalizeTrack(t, this.source));
    if (this.source === 'joox') {
      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          name: await toSimplified(item.name),
          album: await toSimplified(item.album),
          artist: await Promise.all(item.artist.map((a) => toSimplified(a))),
        })),
      );
    }
    return { items, hasMore: items.length === count };
```

把 getLyric 方法体（第 45-52 行）替换为：

```ts
    const json = await requestMusicApiJSON<{ lyric?: string; tlyric?: string }>({
      types: 'lyric',
      source: this.source,
      id: track.lyric_id,
    });
    const lyric = this.source === 'joox' ? await toSimplified(json.lyric ?? '') : json.lyric ?? '';
    return { lyric, tlyric: json.tlyric ?? '' };
```

- [ ] **Step 7: 类型检查 + dev 验证**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，音源切到 Joox，搜索一位港台歌手（例如「周杰倫」）。
Expected: 结果列表中的曲名/歌手/专辑为简体（如「周杰伦」），歌词同为简体。

- [ ] **Step 8: 提交**

```bash
git add src/utils/t2s.ts src/utils/t2s.test.ts src/music/source/base-provider.ts package.json package-lock.json
git commit -m "feat: simplify traditional Chinese from the Joox source"
```

---

### Task 10: AI 走 Rust 通道（key 内置）

**Files:**
- Modify: `src-tauri/build.rs`
- Create: `src-tauri/src/ai.rs`
- Modify: `src-tauri/src/lib.rs`（加 `mod ai;`）
- Modify: `src/ai/aiClient.ts`

- [ ] **Step 1: build.rs 内嵌 AI 配置**

整文件替换为：

```rust
use std::path::PathBuf;

/// Embeds the AI endpoint/key/model at compile time so the packaged app
/// needs no runtime config and the key never reaches the frontend.
fn write_ai_config() {
  let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
  let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
  let env_path = manifest.join("../.env.local");

  let mut endpoint = String::new();
  let mut key = String::new();
  let mut model = String::new();
  if let Ok(text) = std::fs::read_to_string(&env_path) {
    for line in text.lines() {
      let line = line.trim();
      if let Some(v) = line.strip_prefix("AURORA_AI_ENDPOINT=") {
        endpoint = v.trim().to_string();
      } else if let Some(v) = line.strip_prefix("AURORA_AI_API_KEY=") {
        key = v.trim().to_string();
      } else if let Some(v) = line.strip_prefix("AURORA_AI_MODEL=") {
        model = v.trim().to_string();
      }
    }
  }
  if endpoint.is_empty() {
    endpoint = "https://opencode.ai/zen/v1".to_string();
  }
  let endpoint = endpoint.trim_end_matches('/').to_string();

  let code = format!(
    "pub const AI_ENDPOINT: &str = {:?};\npub const AI_API_KEY: &str = {:?};\npub const AI_MODEL: &str = {:?};\n",
    endpoint, key, model
  );
  std::fs::write(out_dir.join("ai_config.rs"), code).expect("write ai_config.rs");
  println!("cargo:rerun-if-changed=../.env.local");
}

fn main() {
  write_ai_config();
  tauri_build::build()
}
```

- [ ] **Step 2: 创建 src-tauri/src/ai.rs（上半部分：状态与模型列表）**

```rust
use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::Channel;

include!(concat!(env!("OUT_DIR"), "/ai_config.rs"));

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiChunk {
  pub delta: Option<String>,
  pub thought: Option<String>,
  pub done: bool,
  pub error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
  pub configured: bool,
  pub endpoint: String,
  pub model: String,
}

#[tauri::command]
pub fn ai_status() -> AiStatus {
  AiStatus {
    configured: !AI_API_KEY.is_empty(),
    endpoint: AI_ENDPOINT.to_string(),
    model: AI_MODEL.to_string(),
  }
}

#[tauri::command]
pub async fn ai_models() -> Result<Vec<String>, String> {
  if AI_API_KEY.is_empty() {
    return Err("AI server key is not configured".into());
  }
  let res = reqwest::Client::new()
    .get(format!("{}/models", AI_ENDPOINT))
    .header("Authorization", format!("Bearer {}", AI_API_KEY))
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    return Err(format!("模型列表 HTTP {}", res.status().as_u16()));
  }
  let value: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
  let mut ids: Vec<String> = value
    .get("data")
    .and_then(|d| d.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(String::from))
        .collect()
    })
    .unwrap_or_default();
  ids.sort();
  Ok(ids)
}
```

- [ ] **Step 3: 追加 src-tauri/src/ai.rs（下半部分：流式对话）**

紧接上一段代码之后追加：

```rust
/// Streams an OpenAI-compatible completion to the webview over an ipc Channel.
#[tauri::command]
pub async fn ai_chat_completions(body: String, on_chunk: Channel<AiChunk>) -> Result<(), String> {
  if AI_API_KEY.is_empty() {
    return Err("AI server key is not configured".into());
  }
  let res = reqwest::Client::new()
    .post(format!("{}/chat/completions", AI_ENDPOINT))
    .header("Authorization", format!("Bearer {}", AI_API_KEY))
    .header("Content-Type", "application/json")
    .header("User-Agent", "FlymeMusic/0.3")
    .body(body)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !res.status().is_success() {
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    let detail: String = text.chars().take(160).collect();
    return Err(format!("AI HTTP {}: {}", status, detail));
  }

  let mut stream = res.bytes_stream();
  let mut buf: Vec<u8> = Vec::new();
  while let Some(chunk) = stream.next().await {
    let bytes = chunk.map_err(|e| e.to_string())?;
    buf.extend_from_slice(&bytes);
    // Split on newline bytes so multi-byte UTF-8 chars are never cut in half.
    while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
      let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
      let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
      if !line.starts_with("data:") {
        continue;
      }
      let data = line[5..].trim();
      if data == "[DONE]" {
        let _ = on_chunk.send(AiChunk { done: true, ..Default::default() });
        return Ok(());
      }
      if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
        let delta = value.pointer("/choices/0/delta");
        let content = delta
          .and_then(|d| d.get("content"))
          .and_then(|c| c.as_str())
          .map(String::from);
        let thought = delta
          .and_then(|d| d.get("reasoning_content").or_else(|| d.get("reasoning")))
          .and_then(|c| c.as_str())
          .map(String::from);
        if content.is_none() && thought.is_none() {
          continue;
        }
        let _ = on_chunk.send(AiChunk { delta: content, thought, done: false, error: None });
      }
    }
  }
  let _ = on_chunk.send(AiChunk { done: true, ..Default::default() });
  Ok(())
}
```

- [ ] **Step 4: lib.rs 加模块声明并验证编译**

在 `mod netease;` 下一行加：

```rust
mod ai;
```

Run: `cd src-tauri; cargo check 2>&1 | Select-Object -Last 20`
Expected: `Finished`；无 error（未注册命令的 dead_code warning 可接受）。

---

- [ ] **Step 5: aiClient.ts 加 Tauri 通道**

顶部 import 区加：

```ts
import { isTauri } from '@/lib/apiTransport';
```

在 aiFetch 函数之后插入：

```ts
interface AiChunk {
  delta?: string | null;
  thought?: string | null;
  done: boolean;
  error?: string | null;
}

async function invokeAi<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Packaged-app path: Rust owns the key and streams deltas over a Channel. */
async function tauriChat(
  body: Record<string, unknown>,
  onDelta: (delta: string) => void,
  onThought?: (thought: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<AiChunk>();
  let full = '';
  let failed: string | null = null;
  let stopped = false;
  channel.onmessage = (chunk) => {
    if (stopped) return;
    if (chunk.error) {
      failed = chunk.error;
      return;
    }
    if (chunk.thought) onThought?.(chunk.thought);
    if (chunk.delta) {
      full += chunk.delta;
      onDelta(chunk.delta);
    }
    if (chunk.done) stopped = true;
  };
  await Promise.race([
    invokeAi<void>('ai_chat_completions', {
      body: JSON.stringify({ ...body, stream: true }),
      onChunk: channel,
    }),
    new Promise<void>((_resolve, reject) => {
      const onAbort = () => {
        stopped = true;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
  if (failed) throw new Error(failed);
  return full;
}
```

---

- [ ] **Step 6: aiClient.ts 三个入口加 Tauri 分支**

getAiStatus 替换为：

```ts
export async function getAiStatus(): Promise<AiStatus> {
  if (isTauri()) return invokeAi<AiStatus>('ai_status');
  const res = await aiFetch('/status', { method: 'GET' });
  if (!res.ok) throw new Error('AI 状态 HTTP ' + res.status);
  return (await res.json()) as AiStatus;
}
```

listAiModels 替换为：

```ts
/** GET /models - list available model ids on the configured endpoint. */
export async function listAiModels(_cfg?: AiConfig): Promise<string[]> {
  if (isTauri()) {
    try {
      return await invokeAi<string[]>('ai_models');
    } catch {
      return [];
    }
  }
  const res = await aiFetch('/models', { method: 'GET' });
  if (!res.ok) throw new Error('模型列表 HTTP ' + res.status);
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
}
```

chatStream 函数体最前面插入（其余浏览器 SSE 代码保持原样）：

```ts
  if (isTauri()) {
    return tauriChat(
      { model: cfg.model, messages, temperature: 0.8, max_tokens: 2400 },
      onDelta,
      onThought,
      signal,
    );
  }
```

chatOnce 函数体最前面插入：

```ts
  if (isTauri()) {
    return tauriChat(
      { model: cfg.model, messages, temperature: 0.9, max_tokens: 120 },
      () => undefined,
      undefined,
      signal,
    );
  }
```

- [ ] **Step 7: 类型检查 + 浏览器 dev 回归**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，打开 AI 页发送一句话。
Expected: 流式回复正常；Network 中仍是 `/api/ai/chat/completions`（浏览器路径未变）。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/build.rs src-tauri/src/ai.rs src-tauri/src/lib.rs src/ai/aiClient.ts
git commit -m "feat: serve AI through Rust commands with the key embedded at build time"
```

---

### Task 11: 下载落盘与提示

音频文件动辄几十 MB，不经 ipc 传字节：Rust 侧直接拉流写盘。桌面弹另存为，Android 写入下载目录。

**Files:**
- Create: `src-tauri/src/download.rs`
- Modify: `src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`（加 `mod download;`）
- Create: `src/utils/notify.ts`、`src/utils/notify.css`、`src/utils/saveBlob.ts`
- Modify: `src/utils/download.ts`
- Modify: `src/utils/lyricShare.ts`（保存卡片段）
- Modify: `src/components/player/FullPlayer.tsx:296-306`

- [ ] **Step 1: Cargo.toml 增加插件与 base64 依赖**

在 [dependencies] 段追加：

```toml
tauri-plugin-http = "2"
tauri-plugin-dialog = "2"
base64 = "0.22"
```

- [ ] **Step 2: 创建 src-tauri/src/download.rs**

```rust
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use std::io::Write;
use std::path::PathBuf;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Streams a remote file straight to disk; audio is far too large for ipc bytes.
async fn stream_to(url: &str, target: &PathBuf) -> Result<(), String> {
  let res = reqwest::Client::new()
    .get(url)
    .header("User-Agent", UA)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    return Err(format!("下载失败：HTTP {}", res.status().as_u16()));
  }
  let mut file = std::fs::File::create(target).map_err(|e| e.to_string())?;
  let mut stream = res.bytes_stream();
  while let Some(chunk) = stream.next().await {
    let bytes = chunk.map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
  }
  file.flush().map_err(|e| e.to_string())
}

/// Desktop: native save dialog. Err("cancelled") means the user dismissed it.
#[cfg(desktop)]
async fn pick_save_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
  use tauri_plugin_dialog::DialogExt;
  let (tx, rx) = tokio::sync::oneshot::channel();
  app
    .dialog()
    .file()
    .set_file_name(file_name)
    .save_file(move |picked| {
      let _ = tx.send(picked);
    });
  match rx.await.map_err(|e| e.to_string())? {
    Some(picked) => picked.into_path().map_err(|e| e.to_string()),
    None => Err("cancelled".into()),
  }
}

/// Android: app-scoped Download dir (public Download needs MediaStore).
#[cfg(mobile)]
fn pick_save_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
  use tauri::Manager;
  let base = app
    .path()
    .download_dir()
    .or_else(|_| app.path().app_data_dir())
    .map_err(|e| e.to_string())?;
  let dir = base.join("FlymeMusic");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(file_name))
}

#[tauri::command]
pub async fn download_and_save(
  app: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Result<String, String> {
  #[cfg(desktop)]
  let target = pick_save_path(&app, &file_name).await?;
  #[cfg(mobile)]
  let target = pick_save_path(&app, &file_name)?;
  stream_to(&url, &target).await?;
  Ok(target.to_string_lossy().into_owned())
}

/// Lyric share cards are generated in a canvas, so they arrive as a data URL.
#[tauri::command]
pub async fn save_image_base64(
  app: tauri::AppHandle,
  file_name: String,
  data_url: String,
) -> Result<String, String> {
  let payload = data_url.split_once(',').map(|pair| pair.1).unwrap_or(data_url.as_str());
  let bytes = STANDARD.decode(payload).map_err(|e| e.to_string())?;
  #[cfg(desktop)]
  let target = pick_save_path(&app, &file_name).await?;
  #[cfg(mobile)]
  let target = pick_save_path(&app, &file_name)?;
  std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
  Ok(target.to_string_lossy().into_owned())
}
```

- [ ] **Step 3: lib.rs 加模块声明并验证编译**

在 `mod ai;` 下一行加：

```rust
mod download;
```

Run: `cd src-tauri; cargo check 2>&1 | Select-Object -Last 20`
Expected: `Finished`；无 error。

- [ ] **Step 4: 创建 src/utils/notify.css 与 src/utils/notify.ts**

notify.css：

```css
.aurora-toast {
  position: fixed;
  left: 50%;
  bottom: calc(28px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 4000;
  max-width: min(84vw, 460px);
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(18, 20, 26, 0.92);
  color: #fff;
  font-size: 13.5px;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  animation: aurora-toast-in 220ms var(--am-ease-spring, ease-out);
}
.aurora-toast--out {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
  transition: opacity 260ms ease, transform 260ms ease;
}
@keyframes aurora-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

notify.ts：

```ts
import './notify.css';

/** Minimal toast - no design-system dependency, callable from any layer. */
export function notify(message: string, ms = 3000): void {
  const el = document.createElement('div');
  el.className = 'aurora-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.classList.add('aurora-toast--out'), ms);
  window.setTimeout(() => el.remove(), ms + 320);
}
```

- [ ] **Step 5: 创建 src/utils/saveBlob.ts**

```ts
/**
 * Mobile browsers ignore a[download] (iOS Safari entirely, Android WebView
 * inside Tauri as well), so offer the file through Web Share first.
 */
export async function saveBlobInBrowser(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
```

---

- [ ] **Step 6: 重写 src/utils/download.ts**

整文件替换为：

```ts
import type { MusicTrack } from '@/music/source/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { useSettingsStore } from '@/store/useSettingsStore';
import { isTauri } from '@/lib/apiTransport';
import { notify } from '@/utils/notify';
import { saveBlobInBrowser } from '@/utils/saveBlob';

function extOf(url: string): string {
  if (url.includes('.m4a')) return 'm4a';
  if (url.includes('.flac')) return 'flac';
  if (url.includes('.ogg')) return 'ogg';
  return 'mp3';
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Resolve the real stream URL, then save it.
 * Packaged app: Rust streams straight to disk (desktop save dialog, Android
 * download dir). Browser: dev media proxy, then Web Share or a[download].
 */
export async function downloadTrack(track: MusicTrack): Promise<void> {
  // Download at the configured quality (default: highest); the resolver
  // falls back to lower bitrates when the quality is unavailable.
  const quality = useSettingsStore.getState().quality;
  const br = quality === 'lossless' ? 999 : quality === 'high' ? 320 : 192;
  const url = await resolveTrackUrl(track, br);
  if (!url) throw new Error('无法获取下载地址（可能受版权限制）');

  const fileName = sanitize(track.artist.join('&') + ' - ' + track.name) + '.' + extOf(url);

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const saved = await invoke<string>('download_and_save', { url, fileName });
    notify('已保存到 ' + saved);
    return;
  }

  const res = await fetch('/api/media-proxy?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('下载失败：' + res.status);
  await saveBlobInBrowser(await res.blob(), fileName);
}
```

- [ ] **Step 7: lyricShare.ts 保存段改造**

顶部 import 区加：

```ts
import { isTauri } from '@/lib/apiTransport';
import { notify } from './notify';
import { saveBlobInBrowser } from './saveBlob';
```

把文件末尾这段（创建 a 标签并触发下载）：

```ts
  const a = document.createElement('a');
  a.download = track.name + '-歌词卡片.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  return true;
```

替换为：

```ts
  const fileName = track.name + '-歌词卡片.png';
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('save_image_base64', { fileName, dataUrl: canvas.toDataURL('image/png') });
    notify('歌词卡片已保存');
    return true;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  await saveBlobInBrowser(blob, fileName);
  return true;
```

- [ ] **Step 8: FullPlayer 把下载/分享错误提示出来**

顶部 import 区加：

```ts
import { notify } from '@/utils/notify';
```

把 handleDownload（第 296-306 行）替换为：

```ts
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadTrack(current);
    } catch (error) {
      // 用户取消另存为不算错误
      if (error instanceof Error && error.message !== 'cancelled') notify(error.message);
    } finally {
      setDownloading(false);
    }
  };
```

把 handleShare（第 308-318 行）的 catch 分支替换为：

```ts
    } catch (error) {
      if (error instanceof Error && error.message !== 'cancelled') notify('分享失败：' + error.message);
    } finally {
```

- [ ] **Step 9: 类型检查 + 浏览器 dev 验证**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，播放一首在线歌曲 → 更多操作 → 下载歌曲；再点分享歌词卡片。
Expected: 桌面 Chrome 触发文件下载（或系统分享面板）；歌词卡片图片保存成功；失败时右下角出现 toast 而不是静默无反应。

- [ ] **Step 10: 提交**

```bash
git add src-tauri/src/download.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/utils/notify.ts src/utils/notify.css src/utils/saveBlob.ts src/utils/download.ts src/utils/lyricShare.ts src/components/player/FullPlayer.tsx
git commit -m "feat: save downloads and lyric cards through Rust on desktop and Android"
```

---

### Task 12: 删除 legacy 本地账号系统

账号已全面走 Supabase，vite 里的本地账号中间件与前端回退分支是过渡产物，打包后无意义且会把密码哈希写在项目目录。

**Files:**
- Modify: `vite.config.ts:86-141`（删除 auroraAuthProxy 及其辅助函数）
- Modify: `src/store/useAuthStore.ts:20-25,40-58,78-86`

- [ ] **Step 1: vite.config.ts 删除本地账号中间件**

删除以下全部内容：`AuroraAccount` 类型、`authFile`、`authTokens`、`readAuroraAccounts`、`writeAuroraAccounts`、`hashAuroraPassword`、`verifyAuroraPassword`、`auroraAuthProxy()`（原第 86-141 行），并从 plugins 数组中移除 `auroraAuthProxy()`。同时删除文件顶部已无引用的 `import fs from 'node:fs';`（`path` 仍被 resolve.alias 使用，保留）。

plugins 数组最终形如：

```ts
  plugins: [react(), genericProxy(), neteaseWeapiProxy(), imageProxy(), mediaDownloadProxy(), aiProxy(env)],
```

- [ ] **Step 2: useAuthStore.ts 删除 legacy 分支**

删除 `legacyRequest` 函数（第 20-25 行）。

把 register 替换为：

```ts
  register: async (email, password) => {
    if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
    if (!supabase) return { ok: false, message: 'Supabase 尚未配置' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, message: error.message };
    if (data.user && data.session) set({ user: mapUser(data.user), token: data.session.access_token });
    return { ok: true, message: data.session ? '注册成功' : '注册成功，请查收验证邮件后登录' };
  },
```

把 login 替换为：

```ts
  login: async (email, password) => {
    if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
    if (!supabase) return { ok: false, message: 'Supabase 尚未配置' };
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user || !data.session) return { ok: false, message: error?.message || '登录失败' };
    set({ user: mapUser(data.user), token: data.session.access_token });
    return { ok: true };
  },
```

把 updateProfile 替换为：

```ts
  updateProfile: async (patch) => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.updateUser({
      data: { nickname: patch.nickname?.trim(), avatarUrl: patch.avatarUrl?.trim() || null },
    });
    if (!error && data.user) set({ user: mapUser(data.user) });
  },
```

- [ ] **Step 3: 删除本地账号数据文件（若存在）**

Run: `if (Test-Path .aurora-auth.json) { Remove-Item .aurora-auth.json }`
Expected: 无输出；文件已被 .gitignore 覆盖，删除后不再产生。

- [ ] **Step 4: 类型检查 + dev 回归**

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run dev`，用 Aurora 账号（用户名 + 6 位数字密码）登录一次、改一次昵称、退出登录。
Expected: 三步都正常，Network 中不再出现 `/api/auth/*` 请求，全部走 supabase.co。

- [ ] **Step 5: 提交**

```bash
git add vite.config.ts src/store/useAuthStore.ts
git commit -m "refactor: drop the legacy local account backend, Supabase only"
```

---

### Task 13: Tauri 配置、权限与打包

**Files:**
- Modify: `src-tauri/src/lib.rs`（注册插件与命令）
- Modify: `src-tauri/tauri.conf.json`（去远程 url、加 csp、版本）
- Modify: `src-tauri/capabilities/default.json`；Create: `src-tauri/capabilities/desktop.json`
- Modify: `src-tauri/Cargo.toml`、`package.json`（版本 0.3.0）
- Modify: `src-tauri/gen/android/app/build.gradle.kts:20`
- Delete: `src-tauri/icons/android/`
- Modify: `README.md`

- [ ] **Step 1: lib.rs 注册插件与命令**

把 lib.rs 中这一段：

```rust
  builder
    .setup(|app| {
```

替换为：

```rust
  builder = builder.plugin(tauri_plugin_http::init());
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_dialog::init());
  }

  builder
    .invoke_handler(tauri::generate_handler![
      netease::netease_post,
      ai::ai_status,
      ai::ai_models,
      ai::ai_chat_completions,
      download::download_and_save,
      download::save_image_base64
    ])
    .setup(|app| {
```

文件顶部的 `mod netease;`、`mod ai;`、`mod download;` 三行确认都在（前几个任务已加）。

- [ ] **Step 2: tauri.conf.json 整文件替换**

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Flyme Music",
  "version": "0.3.0",
  "identifier": "com.flyme.music",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Flyme Music",
        "width": 960,
        "height": 680,
        "resizable": true,
        "fullscreen": false,
        "minWidth": 380,
        "minHeight": 560
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https: http:; media-src 'self' blob: https: http:; connect-src 'self' ipc: http://ipc.localhost https:; font-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": [
      "nsis"
    ],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "debugApplicationIdSuffix": ".debug"
    },
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": [
          "SimpChinese",
          "English"
        ]
      }
    }
  }
}
```

关键点：删除了 `app.windows[0].url`（原来指向 https://flyme-music.pages.dev），应用从此加载打包进安装包的本地 dist；`media-src` 必须放行 https/http，否则在线音频无法播放。

- [ ] **Step 3: capabilities 权限**

`src-tauri/capabilities/default.json` 整文件替换（删除 remote.urls，加 http 权限）：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    {
      "identifier": "http:default",
      "allow": [
        { "url": "https://**" },
        { "url": "http://**" }
      ]
    }
  ]
}
```

新建 `src-tauri/capabilities/desktop.json`（dialog 仅桌面注册，权限也必须只在桌面声明，否则移动端 ACL 构建会报插件缺失）：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "desktop",
  "description": "desktop-only permissions",
  "windows": [
    "main"
  ],
  "platforms": [
    "linux",
    "macOS",
    "windows"
  ],
  "permissions": [
    "dialog:default"
  ]
}
```

- [ ] **Step 3b: 打包环境改用 HashRouter**

打包后本地 dist 由 Tauri 自定义协议提供，BrowserRouter 的深链（如 /my-playlist/:id）在 webview 重新载入时可能取不到 index.html。修改 `src/main.tsx`：

import 区把 `import { BrowserRouter } from 'react-router-dom';` 改为：

```tsx
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { isTauri } from '@/lib/apiTransport';
```

在 createRoot 之前加入：

```tsx
/** 打包应用用 hash 路由（本地协议无 history 回退）；网页版保持 history 模式。 */
const Router = isTauri() ? HashRouter : BrowserRouter;
```

JSX 中的 `<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>` 与对应的 `</BrowserRouter>` 替换为：

```tsx
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
```

```tsx
    </Router>
```

Run: `npx tsc -b --force`
Expected: 无输出。

- [ ] **Step 4: 版本号统一 0.3.0**

`package.json`：`"version": "0.1.0"` 改为 `"version": "0.3.0"`。
`src-tauri/Cargo.toml`：`version = "0.1.0"` 改为 `version = "0.3.0"`。

- [ ] **Step 5: Android release 允许明文 HTTP**

`src-tauri/gen/android/app/build.gradle.kts` 第 20 行（defaultConfig 内）：

```kotlin
        manifestPlaceholders["usesCleartextTraffic"] = "true"
```

原值为 `"false"`；部分封面/音频回退地址仍是 http，release 包需要放行。debug 段第 30 行本来就是 true，不动。

- [ ] **Step 6: 删除旧版 CLI 遗留图标**

Run: `Remove-Item -Recurse -Force src-tauri\icons\android`
Expected: 目录消失。Android 图标的真实位置是 `src-tauri/gen/android/app/src/main/res/mipmap-*`（由 `npx tauri icon` 写入），删除遗留目录不影响构建。

- [ ] **Step 7: README 补打包与图标章节**

在 README「快速开始」之后插入：

```markdown
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

## 更换应用图标

1. 用 1024x1024 的 PNG 覆盖 `src-tauri/icons/app-icon.png`
2. 运行 `npx tauri icon src-tauri/icons/app-icon.png`
3. 重新打包。桌面图标写入 `src-tauri/icons/`，Android 图标写入 `src-tauri/gen/android/app/src/main/res/mipmap-*`
```

- [ ] **Step 8: 全量静态验证**

Run: `npm run test`
Expected: 3 个测试文件全绿（apiTransport / weapi / t2s）。

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run build`
Expected: 构建成功，dist 产出 index.html 与 official.html。

Run: `cd src-tauri; cargo check 2>&1 | Select-Object -Last 20`
Expected: `Finished`，无 error。

- [ ] **Step 9: 提交**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities src-tauri/Cargo.toml package.json src-tauri/gen/android/app/build.gradle.kts README.md src/main.tsx
git add -A src-tauri/icons
git commit -m "build: package as a standalone Tauri app with local assets and CSP"
```

---

### Task 14: 移动端 FullPlayer 布局修复

真机（细长屏）上封面与底部控制区之间出现巨大空隙。根因：封面被 `min(84vw, 50vh)` 限死，而 `.hc-p-spacer` 是 `flex: 1` 且无上限，剩余高度全灌进这个空隙。修复思路：让**封面区域**吸收多余高度并居中，spacer 退回固定小间距。

**Files:**
- Modify: `src/components/player/halcyon.css:390-421,674-681`

- [ ] **Step 1: .hc-p-body 使用动态视口高度**

把（第 390-397 行）：

```css
.hc--p .hc-p-body {
  height: 100%;
```

改为：

```css
.hc--p .hc-p-body {
  height: 100%;
  height: 100dvh;
```

其余属性（display/flex-direction/max-width/margin/padding）保持不变。`100dvh` 规避 Android WebView 与浏览器地址栏导致的视口差异，旧内核回退到上一行的 `100%`。

- [ ] **Step 2: 封面区域吸收多余高度**

把（第 403-412 行）：

```css
.hc-p-cover {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 14px 0 12px;
}
.hc--p .hc-p-cover .hc-cover {
  width: min(84vw, 50vh);
  height: auto;
}
```

替换为：

```css
.hc-p-cover {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0 12px;
}
.hc--p .hc-p-cover .hc-cover {
  width: min(84vw, 58vh);
  height: auto;
}
```

- [ ] **Step 3: spacer 改为固定小间距**

把（第 417-421 行）：

```css
.hc-p-spacer {
  /* flex-grow so leftover height lands above the controls, pinning them to the bottom */
  flex: 1 1 clamp(10px, 3vh, 28px);
  min-height: 12px;
}
```

替换为：

```css
.hc-p-spacer {
  /* 固定小间距：多余高度由 .hc-p-cover 居中吸收，避免封面与控制区之间出现大空隙 */
  flex: 0 0 clamp(10px, 3vh, 28px);
  min-height: 12px;
  max-height: 28px;
}
```

`.hc--p-lyrics .hc-p-spacer { display: none; }`（第 488-490 行）保持不变。

- [ ] **Step 4: 同步 WEBVIEW SQUARE FALLBACK 段**

把文件末尾（第 674-681 行）：

```css
/* WEBVIEW SQUARE FALLBACK */
/* Old Android WebViews lack aspect-ratio: the cover would collapse to zero
   height and the whole player layout shifts. Pin an explicit square size
   (identical result where aspect-ratio is supported). */
.hc--p .hc-p-cover .hc-cover {
  width: min(84vw, 50vh);
  height: min(84vw, 50vh);
}
```

替换为：

```css
/* WEBVIEW SQUARE FALLBACK */
/* Old Android WebViews lack aspect-ratio: the cover would collapse to zero
   height and the whole player layout shifts. Pin an explicit square size
   (identical result where aspect-ratio is supported). */
.hc--p .hc-p-cover .hc-cover {
  width: min(84vw, 58vh);
  height: min(84vw, 58vh);
  max-height: 100%;
}
```

- [ ] **Step 5: 浏览器设备模拟验证**

Run: `npm run dev`，Chrome DevTools 设备模式依次选 393x873（19.5:9）与 360x900（20:9），打开任意歌曲的全屏播放页，在 Console 执行：

```js
const cover = document.querySelector('.hc-p-cover .hc-cover').getBoundingClientRect();
const meta = document.querySelector('.hc--p .hc-meta-row').getBoundingClientRect();
const spacer = document.querySelector('.hc-p-spacer').getBoundingClientRect();
console.log('cover->meta', Math.round(meta.top - cover.bottom), 'spacer', Math.round(spacer.height));
```

Expected: `spacer` 高度 ≤ 28；`cover->meta` ≤ 96（中间只允许单行歌词条）。

- [ ] **Step 6: 三种模式回归**

在同一设备模拟下切换：封面模式、歌词模式（点右上歌词按钮）、沉浸封面模式（更多操作 → 沉浸封面）。
Expected: 歌词页仍占满可用高度并可滚动；沉浸模式全屏铺满无空白条；封面模式标题行紧贴进度条，无巨大空隙。

- [ ] **Step 7: 提交**

```bash
git add src/components/player/halcyon.css
git commit -m "fix: keep the mobile player cover and controls visually connected"
```

---

### Task 15: 端到端验证与打包

- [ ] **Step 1: 全量静态检查**

Run: `npm run test`
Expected: apiTransport / weapi / t2s 三个测试文件全绿。

Run: `npx tsc -b --force`
Expected: 无输出。

Run: `npm run build`
Expected: dist 产出 index.html 与 official.html，无报错。

Run: `cd src-tauri; cargo check 2>&1 | Select-Object -Last 20`
Expected: `Finished`，无 error。

- [ ] **Step 2: tauri dev 桌面回归（直连路径首次真正生效）**

Run: `npx tauri dev`
逐项验证：

1. 搜索（网易 / QQ / Joox 三个源各搜一次）——Joox 结果为简体
2. 播放在线歌曲，进度条推进、封面显示、播放器背景动态色正确
3. 歌词显示与滚动（网易与 QQ 各一首）
4. 榜单页：网易榜单 + QQ 榜单（含卡片封面）
5. AI 页发送一句话：流式逐字输出，模型列表可见
6. Aurora 账号登录 / 改昵称 / 上传头像 / 退出
7. 更多操作 → 下载歌曲：弹另存为，保存后 toast 提示路径，文件可播放
8. 分享歌词卡片：弹另存为，PNG 内容含封面与歌词
9. F11 全屏切换与右上角注入的全屏按钮仍可用
10. DevTools Console 无 CSP 报错（若有 script-src 报错，说明注入脚本被 CSP 拦截，在 tauri.conf.json 的 script-src 追加 'unsafe-inline' 后重跑）

- [ ] **Step 3: 打 Windows 安装包并做断网验证**

Run: `npm run tauri:build`
Expected: 产物位于 `src-tauri/target/release/bundle/nsis/*.exe`。

安装后：
1. 断网启动 → 应用正常打开（不再白屏），本地歌单/收藏可见，播放走模拟时钟
2. 恢复网络 → 搜索与在线播放恢复
3. 任务栏与桌面快捷方式图标为黑底白音符
4. 全程不访问 flyme-music.pages.dev（可用资源监视器确认）

- [ ] **Step 4: 打 Android 包并真机验证**

前置：`JAVA_HOME`、`ANDROID_HOME`（含 NDK）已配置，且已执行过 `npx tauri android init`（本项目 gen/android 已存在）。

Run: `npm run tauri:build:android`
Expected: 产物位于 `src-tauri/gen/android/app/build/outputs/apk/universal/release/` 或 bundle 目录。

真机安装后逐项验证：

1. 桌面图标为黑底白音符
2. 搜索 + 在线播放 + 歌词
3. 全屏播放页布局：封面与底部控制区之间无巨大空隙（对照 Task 14 的量化标准）
4. Joox 源结果为简体
5. 下载歌曲：文件落在应用 Download/FlymeMusic 目录，toast 显示完整路径
6. AI 页流式输出正常
7. Aurora 账号登录正常

- [ ] **Step 5: 记录已知限制并提交**

在 README「打包成独立应用」章节末尾追加：

```markdown
### 已知限制

- Android 下载写入应用专属目录（作用域存储），文件管理器路径为 Android/data/com.flyme.music/files/Download/FlymeMusic；写入公共 Download 需要 MediaStore，属后续增强
- 打包应用内取消 AI 请求只会停止前端渲染，Rust 侧的上游请求会自然结束
- 应用图标源图固定为 src-tauri/icons/app-icon.png，换图标必须重跑 npx tauri icon
```

```bash
git add README.md
git commit -m "docs: record standalone build steps and known limitations"
```

- [ ] **Step 6: 收尾提醒（不在本计划内执行）**

- 轮换 `.env.local` 里的 `AURORA_AI_API_KEY`（该 key 已在会话中出现过），轮换后重新 `npm run tauri:build` 才会内嵌新 key
- 线上 flyme-music.pages.dev 的后端与本仓库无关，可继续保留给网页版使用；桌面/移动端已不再依赖它
