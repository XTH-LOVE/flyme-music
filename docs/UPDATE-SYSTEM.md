# 版本更新系统：Otter Music 的做法，与 Flyme Music 的落地

调研对象：`D:\otter-music-main`（Capacitor 架构）。Flyme Music 是 Tauri 架构，**思路可以直接搬，但三处实现必须换**——下面标出来了。

---

## 一、Otter 的整体结构：三段式

```
客户端 ──GET /update/check──▶ 自己的后端 ──▶ GitHub Releases API
   │                              │
   └──下载 APK◀──GET /update/download?url=…（代理）◀── objects.githubusercontent.com
```

三个角色各司其职：

| 角色 | 文件 | 干什么 |
|---|---|---|
| **客户端** | `src/components/settings/UpdateCheck.tsx` + `src/lib/api/update.ts` + `src/store/app-store.ts` | 显示当前版本、检查更新、展示更新日志、给下载按钮 |
| **后端** | `functions/routes/update.ts`（Hono，147 行） | 代理 GitHub Releases API、代理 APK 下载 |
| **CI** | `.github/workflows/release-mobile.yml` | 打 tag 触发 → 构建 → 签名 → 发 GitHub Release |

**关键设计判断：客户端不直接调 GitHub API。** 原因有两个 ——
1. GitHub API 有速率限制，且**国内直连不稳定**；
2. 客户端直连会把 GitHub 的响应结构耦合进前端，将来换托管（比如换到对象存储）要改客户端。

后端还做了**两级缓存**：`cf: { cacheTtl: 600 }` 缓存 GitHub 响应 10 分钟，APK 代理响应 `max-age=3600`。这样即使很多人同时开 App，也不会把 GitHub 的限额打满。

---

## 二、数据契约（这是最该照抄的部分）

后端 `/update/check` 返回：

```ts
interface UpdateInfo {
  latestVersion: string;   // 直接用 tag，如 "v2.0.2"
  changelog: string;       // GitHub Release 的 body（markdown）
  downloadUrl: string;     // 自己的代理地址（国内加速）
  directUrl: string;       // GitHub 原始地址（备用）
  publishDate: string;     // ISO 时间
  size: number;            // 字节，前端自己换算 MB
}
```

**给两个下载地址是刻意的**：`downloadUrl` 走代理求快，`directUrl` 走原始地址求稳。UI 上就是两个按钮「国内加速下载」和「从 GitHub 下载」——代理挂了用户还有退路。

### 版本比较

`app-store.ts` 里：

```ts
const normalizeVersion = (v) => v.trim().replace(/^v/i, '').match(/\d+(?:\.\d+)*/)?.[0] ?? '0.0.0';
const hasUpdate = compareVersions(currentVersion, info.latestVersion) < 0;
```

**先剥掉 `v` 前缀再比**。Otter 的 tag 是 `v2.0.2` 而 App 内版本是 `2.0.2`，不归一化就会把「已是最新」误判成「有更新」。

### 节流

```ts
if (silent && state.lastCheckTime && now - state.lastCheckTime < 24 * 60 * 60 * 1000) return;
```

启动时**静默检查，24 小时最多一次**；用户手动点「检查更新」时 `silent=false`，不受节流限制。`lastCheckTime` 持久化，所以重开 App 不会重置。

### 当前版本从哪来

```ts
const getCurrentVersion = async () => {
  if (Capacitor.isNativePlatform()) {
    const info = await App.getInfo();   // 原生包的真实版本
    return info.version;
  }
  return __APP_VERSION__;               // Web 版：构建时注入的常量
};
```

**原生包读原生版本，Web 读构建注入的常量** —— 两者可能不一致（原生包更新了但用户还开着旧页面），所以不能只用一个来源。

---

## 三、安装包是怎么产出的

### 版本号一键同步

```bash
npm version patch    # 1.0.0 → 1.0.1
```

`package.json` 里挂了 `"version": "node scripts/update-mobile-version.js && git add android/app/build.gradle"` —— **npm 的 version 钩子**，一次把 `package.json` 和 `android/app/build.gradle` 的版本号同步掉，并把改动加进暂存区。这样 `npm version patch` 之后直接 `git push --tags` 就行。

### 发布流程（四步）

```bash
# 0. 写更新日志：public/release/v2.0.2.md（文件名必须与新 tag 一致）
# 1. 改版本号
npm version patch
# 2. 推送代码和 tag，触发 CI
git push && git push --tags
# 3. CI 自动构建 + 签名 + 发 Release，APK 挂在 Release 页
```

### CI 的关键几步

```yaml
on:
  push:
    tags: ["v*"]          # 打 v 开头的 tag 就触发
permissions:
  contents: write          # 发 Release 需要
concurrency:
  group: release-android-${{ github.ref_name }}
  cancel-in-progress: true # 同一个 tag 重复触发不打架
```

构建链：`npm ci` → `npm run build` → `npx cap sync android` → `./gradlew assembleRelease` → **签名** → 上传 artifact → 发 Release。

**签名走 GitHub Secrets**（4 个：`SIGNING_KEY` / `ALIAS` / `KEY_STORE_PASSWORD` / `KEY_PASSWORD`），`SIGNING_KEY` 是 keystore 文件的 **Base64**：

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("android/xxx-release.jks"))
Set-Clipboard $b64
```

**发布与构建分成两个 job**，`publish-release` 加了 `if: startsWith(github.ref, 'refs/tags/v')` —— 手动触发（`workflow_dispatch`）时只构建不发版，方便测试构建链而不污染 Release 列表。

**Release note 缺省处理**：找得到 `public/release/<tag>.md` 就用它，找不到自动生成一段模板，**不让发布因为漏写日志而失败**。

**预发布识别**：tag 里含 `-beta` / `-alpha` / `-rc` / `-preview` 就标成 prerelease。

---

## 四、Flyme Music 落地：三处必须换

### ① 版本号来源：Capacitor → Tauri

| | Otter | Flyme Music |
|---|---|---|
| 原生版本 | `App.getInfo().version` | `getVersion()` from `@tauri-apps/api/app` |
| 构建注入 | `__APP_VERSION__` | Vite `define` 注入 `__APP_VERSION__`（同样做法） |
| 版本源文件 | `package.json` + `android/app/build.gradle` | `package.json` + **`src-tauri/tauri.conf.json`** |

**Tauri 的坑**：版本号在 `tauri.conf.json` 的 `version` 字段（现在是 `0.3.0`），**不是** `Cargo.toml`（那里也有一个 `version`，但 Tauri 用的是 conf 里那个）。同步脚本要改这两个。

### ② 构建与签名：Capacitor → Tauri

Otter 是 `npx cap sync android` + `./gradlew assembleRelease`。Flyme Music 是 `npx tauri android build --apk`。

**签名**：Otter 用 `r0adkll/sign-android-release` 这个 action 对已产出的 APK 二次签名。Tauri 更推荐**在 `build.gradle.kts` 里配 `signingConfig`**，让构建直接出签名包 —— 因为 `tauri android build --release` 会自己调 Gradle，二次签名需要额外定位产物路径。

`src-tauri/gen/android/app/build.gradle.kts` 里加：

```kotlin
android {
  signingConfigs {
    create("release") {
      storeFile = file(System.getenv("KEYSTORE_PATH") ?: "release.jks")
      storePassword = System.getenv("KEY_STORE_PASSWORD")
      keyAlias = System.getenv("ALIAS")
      keyPassword = System.getenv("KEY_PASSWORD")
    }
  }
  buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("release") } }
}
```

CI 里把 `SIGNING_KEY` 的 Base64 还原成文件、导出那三个环境变量即可。

> **本项目已踩过的坑**：构建机上 `link.exe` 会被 Git Bash 的 coreutils 抢走（见 `scripts/build-android.sh` 的注释）。**CI 跑在 ubuntu 上没这个问题**，但本地构建必须先跑那个脚本设好 PATH。

### ③ APK 从哪来：GitHub Releases → 需要先有远端

**这是最大的阻塞。** Otter 的 APK 挂在 GitHub Releases 上，靠 `softprops/action-gh-release` 上传。而 **Flyme Music 这个仓库没有任何 git remote**（reflog 最早一条是 `commit (initial)`，从未 clone 过），所以：

- CI 的 tag 触发**不会发生**
- 也没有 Release 页面可以挂 APK

三条路可选：

| 方案 | 优点 | 代价 |
|---|---|---|
| **A. 建 GitHub 仓库**（推荐） | 完全照搬 Otter；免费、有 Release 页、有 action 生态 | 需要一个仓库（可私有） |
| **B. APK 放 Cloudflare R2/Pages** | 不用 GitHub；你已经有 Cloudflare 账号 | 要自己写上传脚本；没有现成的更新日志载体 |
| **C. 只做客户端检查，APK 手动传** | 最快 | 每次发版手动，容易漏 |

**推荐 A**，因为它同时解决了「更新日志写在哪」（Release body）和「APK 挂在哪」两个问题，而且 Flyme Music 已经有 `functions/` 可以加更新接口。

---

## 五、具体实施清单（照这个顺序做）

### 第一步：后端更新接口（Cloudflare Pages Functions，本仓库已有）

新增 `functions/api/update/check.ts`，照抄 Otter 的 `functions/routes/update.ts` 逻辑，但注意本项目的 Functions 用的是**文件路由**（`functions/api/xxx.ts`），不是 Hono。

需要两个环境变量（dashboard → Settings → Variables）：
- `GITHUB_REPO` = `你的用户名/flyme-music`
- `GITHUB_TOKEN`（可选，私有仓库或提高限额时必填）

同时加 `functions/api/update/download.ts` —— **APK 下载代理**。这个不是可选项：`objects.githubusercontent.com` 在国内直连经常失败，没有代理用户就下不动。

### 第二步：客户端

- `src/utils/versionCompare.ts` —— 纯函数，`normalizeVersion` + `compareVersions`，**要单测**（`v2.0.2` vs `2.0.2`、`1.10.0` vs `1.9.0` 这类）
- `vite.config.ts` 加 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`
- `src/utils/update.ts` —— 调 `/api/update/check`，用 `getVersion()`（Tauri）或 `__APP_VERSION__`（Web）
- `src/pages/SettingsPage.tsx` 加「关于 / 版本更新」一节：当前版本 + 检查按钮 + 更新日志 + 两个下载按钮
- 节流：`lastCheckTime` 存 localStorage，静默检查 24 小时一次

### 第三步：CI

新增 `.github/workflows/release-android.yml`，改造点：
- 加一步还原 keystore：`echo "$SIGNING_KEY" | base64 -d > src-tauri/gen/android/release.jks`
- 加一步同步版本号到 `tauri.conf.json`
- 构建用 `npx tauri android build --apk`
- 需要 `ANDROID_HOME` / `NDK_HOME`（ubuntu-latest 上要自己装，或用 `android-actions/setup-android`）

### 第四步：发版流程文档

照 Otter 的 `Release_Guide.md` 写一份，核心是让发版变成：
```bash
# 写 public/release/v0.4.0.md
npm version patch
git push && git push --tags
```

---

## 六、几个值得单独抄的细节

1. **两个下载地址**（代理 + 原始）—— 代理挂了用户有退路，这是国内分发的基本要求
2. **发布与构建分成两个 job** —— 手动触发只构建不发版，能安全地测构建链
3. **更新日志缺省兜底** —— 不让漏写日志阻塞发版
4. **`concurrency` + `cancel-in-progress`** —— 同一 tag 重复触发不打架
5. **tag 里带 `-beta` 自动标 prerelease** —— 不用手动区分正式/测试版
6. **版本号归一化后再比较** —— `v` 前缀不剥会误报更新
7. **静默检查 24 小时节流，手动检查不受限** —— 既不会每次开 App 都请求，也不会让用户觉得「点不动」
8. **原生包读原生版本，Web 读构建常量** —— 两个来源都要有，否则更新后会读到旧版本号
