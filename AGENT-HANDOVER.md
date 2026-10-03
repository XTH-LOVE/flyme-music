# Flyme Music — 构建 / 发布 / 部署 交接文档

> 给接手的 AI 助手或开发者。**先读完这份再动手。**
> 里面的「陷阱」都是实际踩出来的，不是推测。

---

## 一、项目与部署

| 项 | 值 |
|---|---|
| 代码 | `D:\AuroraMusic` |
| 技术栈 | Tauri 2 + React 18 + TypeScript + Vite 6 |
| 目标平台 | **Android / Windows / Web 同一套代码库** |
| 仓库 | `github.com/XTH-LOVE/flyme-music`（**公开**）|
| 网页版 | `flyme-music.pages.dev`（Cloudflare Pages，项目名 `flyme-music`）|
| 官网 | `/official` —— **不要写 `/official.html`**，会 308 跳到 `/official` |
| Cloudflare 账号 | `2678049088@qq.com` / 账号 ID `a6fc25eb5bd6e9ee026276d9c876b797` |
| **签名密钥** | `D:\1\flyme-music-signing\` —— **丢了就无法给已安装用户推升级** |
| 作者名 | `src/legal/AboutSection.tsx` 的 `AUTHOR` 常量（改一处全改）|

**当前版本**：见 `package.json`。

---

## 二、推送代码（**三条路，按顺序试**）

> ⚠️ **这台机器/网络的特殊限制，三条路会互相补位，不要假定某一条一定行。**

### 路 1：直接 push（最快）

```bash
cd /d/AuroraMusic
URL="https://<TOKEN>@github.com/XTH-LOVE/flyme-music.git"
OLD=$(git ls-remote "$URL" refs/heads/main | cut -f1)
git push --force-with-lease=main:$OLD "$URL" main
```

**`github.com` 时通时不通** —— 同一个小时内可能先成功、20 分钟后返回 `CONNECT tunnel failed, response 502`。
**「刚才通了」不等于「现在能通」**，失败就换路 2。

### 路 2：bash + curl 走 Git Data API（**最可靠**）

```bash
bash D:/1/push-api.sh <TOKEN> <基准提交>
```

- **`api.github.com` 稳定可达**（比 `github.com` 可靠得多）
- **`curl` 由 bash 直接 spawn**，不受 Node 的 `EBUSY` 影响（见路 3 的问题）
- 用 `base_tree` 复用远端已有的树，**只上传变更文件**，几个文件几秒完成

**`<基准提交>` 是必须传对的参数**，见下方「陷阱 1」。

### 路 3：`node D:/1/api-push.mjs`

**只在 Node 能 spawn 子进程时可用。** 这台机器上 Node 经常**完全无法 spawn**
（`spawnSync git EBUSY`，连 `cmd.exe` 都失败）。

---

## 三、发版流程（Android + Windows 安装包）

```bash
cd /d/AuroraMusic

# 1. 写更新日志（用户会在 App 内的「更新说明」看到）
#    文件：public/release/v<新版本>.md
cat > public/release/v0.8.5.md <<'EOF'
# Flyme Music v0.8.5
### 修复
- ...
EOF

# 2. 提版本号（同时改 package.json 和 tauri.conf.json）
npm version patch --no-git-tag-version
node scripts/sync-version.mjs

# 3. 确认三处版本一致
node -e "const v=require('./package.json').version;const t=require('./src-tauri/tauri.conf.json').version;console.log(v===t?'一致 ✓':'不一致 ✗')"

# 4. 提交
git add -A && git commit -m "release: v<新版本>"

# 5. 推送（用上面三条路之一）

# 6. 建 tag —— 这一步触发 CI 编译
```

**建 tag（用 API，因为 `git push` 可能不通）**：

```bash
T="<TOKEN>"; API="https://api.github.com/repos/XTH-LOVE/flyme-music"
SHA=$(curl -s -H "Authorization: Bearer $T" "$API/git/ref/heads/main" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).object.sha")
curl -s -X POST -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json" \
  "$API/git/refs" -d "{\"ref\":\"refs/tags/v<新版本>\",\"sha\":\"$SHA\"}"
```

**tag 创建后 CI 自动编译**（约 15 分钟），产物发布到
`github.com/XTH-LOVE/flyme-music/releases/tag/v<新版本>`。

**给用户的下载链接要用带版本号的**：

```
https://github.com/XTH-LOVE/flyme-music/releases/download/v<版本>/app-universal-release.apk
```

**不要用 `releases/latest`** —— 它随时间变，用户点的时候可能已经是别的版本。

**查编译状态**：

```bash
curl -s -H "Authorization: Bearer $T" "$API/actions/runs?per_page=3" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  (JSON.parse(d).workflow_runs||[]).forEach(w=>console.log(w.name,w.status,w.conclusion||'-',w.head_branch));
});"
```

---

## 四、网页部署

**Cloudflare Pages，连的是 GitHub 仓库的 `main` 分支** ——
**所以「推送成功 = 网页会自动重新部署」**，不需要额外操作。

- 构建命令与输出目录在 Cloudflare 后台配置
- 部署完成后访问 `flyme-music.pages.dev`
- 若要手动触发，在 Cloudflare 后台点重新部署，或往 `main` 推一个空提交

**另有 `scripts/make-cf-release.mjs`** —— 生成给 Cloudflare 用的发布产物，
具体用途看脚本头部注释。

---

## 五、⚠️ 必须知道的陷阱

### 陷阱 1：推送脚本的基准提交

`bash D:/1/push-api.sh <TOKEN> <基准提交>` 里的**基准必须是「内容已经在远端」的那个本地提交**。

**传错会静默漏文件**：如果基准传成了「含本次改动的提交」，`git diff` 就把改动本身排除了，
**远端看起来推送成功，实际没有那些改动**。

**正确做法**：基准 = 远端当前内容对应的本地提交。
**推送后必须校验**改动真的在远端：

```bash
curl -s -H "Authorization: Bearer $T" \
  "$API/contents/<文件路径>?ref=main" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      console.log(Buffer.from(JSON.parse(d).content,'base64').toString('utf8').includes('<你要找的字符串>'));
    });"
```

> **这个坑真的发生过**：v0.8.4 推送成功、tag 建了、CI 编译通过，
> **但修复根本没进包**，用户反馈「还是一样」，才查出来。

### 陷阱 2：API 创建的提交和本地 SHA 不同

通过 API 推送时，GitHub 会用**相同的内容**创建一个**不同的 SHA**。
所以 **tag 要指向远端那个 SHA，不是本地 HEAD**。

**推送成功的判据是「远端 ref 的 SHA == 刚创建的 commit」**，不是「命令没报错」。

### 陷阱 3：大文件不能走命令行参数

`Argument list too long` —— base64 内容必须经**文件**传给 curl（`--data-binary @file`）。

### 陷阱 4：`/tmp` 在两次 Bash 调用间不保留

脚本要写在**持久路径**（如 `D:/1/`），并在**同一条命令里**运行。

### 陷阱 5：Android / Kotlin / Rust 的改动本地验证不了

**这台机器编译不了 Android。** 相关改动只能靠 CI 验证。

**所以：Android 改动尽早发版让 CI 验，不要堆在本地。**

（历史上「本地能跑 ≠ CI 能跑」出现过 6 次，其中 5 次只有 CI 能发现。）

### 陷阱 6：WebView 版本差异

**打包版（Android/Windows）和网页版行为不同，且经常静默失效。**

新功能要在两端都测。详细清单见用户级技能 `tauri-webview-parity`。

### 陷阱 7：`src-tauri/gen/android/` 是生成目录

里面是 Tauri 生成的 Android 工程，但**本项目会直接改它**（自定义 Service / 插件）。
改动前先确认 CI 不会重新生成覆盖。

---

## 六、发版前检查清单

```
[ ] public/release/v<版本>.md 已写
[ ] npm version patch --no-git-tag-version && node scripts/sync-version.mjs
[ ] 三处版本一致（package.json / tauri.conf.json）
[ ] npx tsc -b          通过
[ ] npx eslint .        通过
[ ] npx vitest run      通过
[ ] git commit && 推送（三条路之一）
[ ] 校验远端 SHA == 本地 HEAD（或 API 返回的 commit）
[ ] 建 tag
[ ] 等 CI（约 15 分钟），确认 success
[ ] 给用户带版本号的 APK 链接
```

---

## 七、日常开发

```bash
cd /d/AuroraMusic
npm run dev          # Vite 开发服务器，默认 http://localhost:5173/
npx vitest run       # 单元测试
npx tsc -b           # 类型检查
npx eslint .         # 代码检查
npm run build        # 网页产物到 dist/
```

**注意**：`npm run dev` 起的服务是**网页版**，和打包版有差异（见陷阱 6）。

---

## 八、已知未解决 / 待办

- **跨设备同步**（收藏/歌单/历史现在只存本机，换手机全丢）—— 已有 Supabase，**投入产出比最高**
- **均衡器在打包版无效**（需 blob 通路，牵涉起播速度的产品取舍）
- **备案号留空**（`AboutSection.tsx` 的 `ICP_LICENSE`，等真实备案号）
- **`plus-lighter` 材质**（Apple Music 风格的最后一项，需真机验证对比度）
- **squircle 封面圆角**（需路径求解器或引库，收益待评估）

功能想法见 `docs/FEATURE-IDEAS.md`、`docs/ROADMAP.md`。
