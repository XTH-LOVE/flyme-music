# 移动端发布手册（Release Guide）

完整流程：**写更新日志 → 改版本号 → 推 Tag → CI 自动构建签名发版**

---

## 0️⃣ 一次性配置（只做一次）

### 建仓库并配置远程

本仓库**目前没有 git remote**，而整套发布依赖 GitHub Releases。先在 GitHub 建一个仓库（私有也可以），然后：

```bash
git remote add origin git@github.com:<你的用户名>/flyme-music.git
git push -u origin main
```

### 生成 Android 签名密钥

**这一步不能跳过，也不能弄丢密钥。**

```bash
keytool -genkeypair -v -keystore flyme-music-release.jks \
  -alias flyme-music -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **密钥丢了就永远无法给已安装的用户推送升级** —— 只能换包名重发，等于所有老用户重新安装。请离线备份 `.jks` 和密码。

导出为 Base64：

```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("flyme-music-release.jks"))
Set-Clipboard $b64
```

### 配置 GitHub Secrets

仓库 `Settings` → `Secrets and variables` → `Actions`，加四项：

| Name | Value |
| :--- | :--- |
| `SIGNING_KEY` | 上面复制的 Base64 |
| `ALIAS` | `flyme-music` |
| `KEY_STORE_PASSWORD` | keystore 密码 |
| `KEY_PASSWORD` | 密钥密码 |

### 配置 Cloudflare 环境变量

Pages 项目 `flyme-music` → `Settings` → `Variables and Secrets`：

| 变量 | 必填 | 说明 |
| :--- | :--- | :--- |
| `GITHUB_REPO` | ✅ | `你的用户名/flyme-music`，`/api/update/check` 靠它找 release |
| `GITHUB_TOKEN` | 可选 | 私有仓库必填；公开仓库也建议加，把 GitHub 限额从 60/小时提到 5000/小时 |

---

## 1️⃣ 写更新日志

在 `public/release/` 下新建 `<tag>.md`，**文件名必须与新 tag 完全一致**：

```bash
public/release/v0.4.0.md
```

这份文件会原样成为 GitHub Release 的正文，App 的「关于 → 版本更新」里显示的就是它。

> 没写也不会失败 —— CI 会生成一段占位文案，但用户看到的就是那句占位。

---

## 2️⃣ 改版本号

```bash
npm version patch   # 0.3.0 → 0.3.1
npm version minor   # 0.3.0 → 0.4.0
npm version major   # 0.3.0 → 1.0.0
```

`npm version` 会更新 `package.json` 并自动打 tag。然后同步到 Tauri：

```bash
node scripts/sync-version.mjs           # 写入
node scripts/sync-version.mjs --check   # 只检查是否漂移（CI 里会用）
```

**只需要改 `tauri.conf.json` 一处。** Android 的 `versionName` / `versionCode` 由 Tauri 在构建时写进自动生成的 `tauri.properties`（那个文件带 "DO NOT EDIT" 标记），不需要手动碰 Gradle。

---

## 3️⃣ 推送触发发布

```bash
git push && git push --tags
```

CI（`.github/workflows/release-android.yml`）会：

1. 装 Node 22 / JDK 21 / Android SDK + NDK 26.1.10909125
2. 从 `SIGNING_KEY` 还原 keystore
3. `node scripts/sync-version.mjs` 同步版本号
4. `npm ci && npm run build`
5. `npx tauri android build --apk`（用 Gradle 的 `signingConfig` 直接出签名包）
6. 把 APK 挂到 GitHub Release

**产物获取**：Release 页面上的 `.apk`。

---

## 4️⃣ 用户怎么拿到更新

App 内「设置 → 关于 → 版本更新」：

- 启动时**静默检查**，24 小时最多一次
- 手动点「检查更新」不受节流限制
- 有新版显示更新日志 + 两个按钮：**国内加速下载**（走 `/api/update/download` 代理）和**从 GitHub 下载**（原始地址）

代理不是可选项：`objects.githubusercontent.com` 在国内经常直连失败，没有代理用户就下不动。

---

## 5️⃣ 本地构建（仅供本地验证）

CI 跑在 ubuntu 上，本地在 Windows 上构建有个**已知的坑**：Git Bash 自带的 coreutils `link.exe` 会抢在 MSVC 链接器前面，导致所有 Rust 构建脚本链接失败（报错是 `link: extra operand`，那是 coreutils 的措辞，不是 MSVC 的）。用封装脚本：

```bash
./scripts/build-android.sh            # debug APK
./scripts/build-android.sh --release  # release APK（需要签名配置）
```

脚本会探测 MSVC / Android SDK / NDK 并设好 `PATH` 与 `LIB`，构建前还用一个最小 Rust 程序做链接器探针 —— 否则要等十几分钟 Gradle 才发现问题。

---

## 发版前检查清单

- [ ] `public/release/<tag>.md` 已就绪
- [ ] `node scripts/sync-version.mjs --check` 无漂移
- [ ] `npm run lint && npx tsc -b && npm test` 全绿
- [ ] GitHub Secrets 四项已配置
- [ ] Cloudflare `GITHUB_REPO` 已配置
- [ ] `git push --tags` 已执行
