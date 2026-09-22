<div align="center">

<img src="public/flyme-mark.jpg" width="112" alt="Flyme Music" />

# Flyme Music

**一个 HyperOS 风格的现代音乐播放器。**
沉浸式歌词 · 动态环境色 · 液态玻璃 · 跨端同代码

[![Release](https://img.shields.io/github/v/release/XTH-LOVE/flyme-music?style=flat-square&color=3482ff&label=release)](https://github.com/XTH-LOVE/flyme-music/releases/latest)
[![Android](https://img.shields.io/badge/Android-9%2B-3ddc84?style=flat-square&logo=android&logoColor=white)](https://github.com/XTH-LOVE/flyme-music/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%2B-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/XTH-LOVE/flyme-music/releases/latest)
[![Web](https://img.shields.io/badge/Web-PWA-4285f4?style=flat-square&logo=pwa&logoColor=white)](https://flyme-music.pages.dev)

[![Tests](https://img.shields.io/badge/tests-707%20passing-3fb950?style=flat-square&logo=vitest&logoColor=white)](https://github.com/XTH-LOVE/flyme-music/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)

[**下载 APK**](https://github.com/XTH-LOVE/flyme-music/releases/latest) · [**在线试听**](https://flyme-music.pages.dev) · [**功能建议**](https://github.com/XTH-LOVE/flyme-music/issues)

</div>

---

## 这是什么

Flyme Music 是一个**从设计出发**的音乐播放器。

它不试图做一个功能最全的播放器，而是想回答一个问题：**一个播放器能不能看起来不像工具，而像一件东西？**

所以它有自己的取色系统、自己的动效语言、自己的玻璃材质 —— 而不是套一层 Material 主题。它同时跑在 **Android / Windows / Web** 上，共用一套代码。

<table>
<tr>
<td width="50%">

### 🎨 视觉

- **封面取色** —— 整个应用的强调色跟着当前歌曲的封面走，每首歌都有自己的样子
- **动态环境色** —— 封面颜色铺成会呼吸的背景
- **液态玻璃** —— 底部导航、迷你播放器、弹层都是真的玻璃：模糊 + 饱和 + 高光
- **开屏动画** —— 字标 + 渐入，不拖时间

</td>
<td width="50%">

### 🎧 播放

- **沉浸式歌词** —— 逐行高亮、点击跳转、桌面歌词悬浮窗
- **通知栏播放器** —— MediaStyle + 封面 + 独立播放/暂停
- **均衡器与响度均衡** —— 带限幅器，不会削波
- **A-B 循环** —— 标记两点反复播放，练歌扒谱用
- **音频书签** —— 在歌里任意位置打标记

</td>
</tr>
<tr>
<td width="50%">

### 🤖 AI 伴听

- **一起听** —— AI 陪你听，知道你在听什么、听了多少遍
- **歌词解读** —— 讲清一句歌词的背景和典故
- **一句话生成歌单** —— 「放点适合下雨天的歌」→ 直接建好

</td>
<td width="50%">

### 📊 时间维度

- **音乐时光机** —— 去年的今天你在听什么
- **音乐日记** —— 最近两周每天听了什么
- **听歌统计** —— 日历热力图、听歌时长、最常听
- **年度报告** —— 可分享成图

</td>
</tr>
</table>

---

## 下载

| 平台 | 方式 | 说明 |
| --- | --- | --- |
| **Android** | [Releases](https://github.com/XTH-LOVE/flyme-music/releases/latest) | 通用 APK，Android 9+ |
| **Windows** | [Releases](https://github.com/XTH-LOVE/flyme-music/releases/latest) | 安装包 / 免安装 |
| **Web** | [flyme-music.pages.dev](https://flyme-music.pages.dev) | PWA，可加到主屏 |

> 首次打开会有一份协议同意书。**不登录也能用** —— 本地音乐和其他音源都不受影响。

---

## 技术栈

```
桌面与移动外壳   Tauri 2                    (Rust)
界面             React 18 + TypeScript strict
构建             Vite 6
状态             Zustand
路由             React Router 6
测试             Vitest · 707 个测试 / 60 个文件
部署             Cloudflare Pages Functions
```

**没有 UI 框架。** 样式是手写的 CSS 变量体系 —— 这套视觉的核心是取色、玻璃和动效，套框架反而要跟框架打架。

---

## 架构要点

<details>
<summary><b>双运行时：WebView ≠ 浏览器</b></summary>

<br />

打包版跑在系统 WebView 里，行为和浏览器**不同，而且往往静默失效**。已经踩出来的坑：

| 症状 | 根因 |
| --- | --- |
| 检查更新失败 | 相对路径 `/api/…` 在 `tauri.localhost` 下打不到后端 |
| 下载按钮无反应 | WebView 丢弃 `<a download>`，必须交给系统打开 |
| AI 不可用 | 密钥在构建时烤进二进制，CI 没有 |
| 顶部压状态栏 | 主题写「退出 edge-to-edge」而 Activity 又开启它，安全区为 0 |
| 均衡器无效 | Web Audio 无法接入打包版的音频元素 |
| 通知栏插件不工作 | 插件命令从 JS 调用要过 Tauri ACL |

**引入新功能前，先确认它在两个运行时下都成立。**

</details>

<details>
<summary><b>音频链路</b></summary>

<br />

```
source → levelGain(响度均衡) → EQ → 限幅器 → analyser → destination
```

几个不显然的结论：

- **限幅器不是可选项。** 响度均衡最多放大 11dB，EQ 再叠加上去，**没有天花板就一定会削波** —— 听起来像「炸麦」，实际是信号被削平。
- **响度均衡必须非对称**（降快升慢）+ 死区 + 长测量窗口，否则会跟着音乐泵动。
- **EQ 必须在 AGC 之后**，否则会被抵消。
- **在线歌曲直连音源**，不经过音频处理链 —— 一个音效不值得拿播放流畅度去换。

</details>

<details>
<summary><b>性能：瓶颈几乎总在「数量」和「顺序」上</b></summary>

<br />

真实踩过的例子：

| 现象 | 真因 |
| --- | --- |
| 歌单加载 5 秒 | 歌曲分批请求**串行** `await`，300 首 = 3 次往返 |
| 手机卡顿 | 列表封面显示 56px，却向 CDN 请求 **300×300** |
| 歌词闪烁 | 每行按索引 `key`，**旧行被卸载**而不是滑出 |
| 播放卡顿 | 100+ 个 DOM 节点每秒重渲数次 |

**单个操作有多快不重要，做多少次、按什么顺序做才重要。**

</details>

<details>
<summary><b>服务端</b></summary>

<br />

Cloudflare Pages Functions 承担三件事：

- **网易云 weapi 转发** —— 浏览器无法直接 POST（CORS + `Set-Cookie` 不可读）
- **图片与音频代理** —— 绕过防盗链，支持 Range 请求（`206` + `Content-Range`），让 `<audio>` 能分块缓冲和拖动
- **更新分发** —— 签名校验后放行

**不存储任何用户数据。** 收藏、歌单、播放记录都在本机。

</details>

<details>
<summary><b>命名：为什么代码里还留着 <code>aurora-*</code></b></summary>

<br />

产品名是 **Flyme Music**，项目历史上曾改名为 Aurora Music，现已改回。**显示文案已全部改回**，但下列标识符**故意保持不变** —— 它们承载用户数据或应用身份，改了会丢数据或变成另一个应用：

| 标识 | 位置 | 不改的原因 |
| --- | --- | --- |
| `aurora.*` 存储键 | localStorage | 改了用户收藏、歌单、历史全部丢失 |
| `aurora-cache` | Cache Storage | 改了要重新下载所有缓存 |
| 应用 ID | `tauri.conf.json` | 改了系统认为是另一个应用，无法覆盖安装 |

</details>

---

## 本地开发

```bash
git clone https://github.com/XTH-LOVE/flyme-music.git
cd flyme-music
npm install

npm run dev                  # 网页版（含 dev 代理）
npm run tauri dev            # 桌面版
npm run tauri android dev    # Android

npm test                     # 707 个测试
npm run lint
```

**打包发版**见 [`Release_Guide.md`](Release_Guide.md)。

> **注意**：CI 跑测试用的是 UTC 时区。涉及日期的改动请用 `TZ=UTC npm test`
> 再验一次 —— 这个差异已经让 CI 红过好几次。

---

## 文档

| 文件 | 内容 |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 整体架构 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 设计语言与取色系统 |
| [`docs/UPDATE-SYSTEM.md`](docs/UPDATE-SYSTEM.md) | 版本更新机制 |
| [`docs/UI-PLAN.md`](docs/UI-PLAN.md) | 移动端 UI 改造方案 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 路线图 |
| [`Release_Guide.md`](Release_Guide.md) | 发版手册 |

---

## 路线图

- [x] 沉浸式歌词与动态环境色
- [x] Android 通知栏播放器
- [x] 均衡器与响度均衡（带限幅）
- [x] 桌面歌词悬浮窗
- [x] 音乐时光机 · 音乐日记
- [x] AI 伴听 · 一句话生成歌单
- [ ] **跨设备同步** —— 收藏、歌单、历史现在只存本机
- [ ] 车载模式
- [ ] 音乐闹钟
- [ ] 自定义主题编辑器

---

## 参与

**欢迎提 Issue。** 尤其是这几类：

- **打包版和网页版表现不一致** —— 这是本项目最容易出错的地方，也最难自查
- **某个界面在窄屏上挤了** —— 请附设备型号和截图
- **某个音源播不了** —— 请附歌曲链接

**提 PR 前请确保 `npm test` 和 `TZ=UTC npm test` 都通过。**

---

<div align="center">

## 关于

**作者**：缐廷华 · [@XTH-LOVE](https://github.com/XTH-LOVE) · **当前版本**：v0.7.0

这个项目没有赞助、没有广告、不上传任何听歌数据。

如果它让你觉得音乐播放器还能更好看一点 —— 那就够了。

<br />

**如果喜欢，点个 ⭐ 吧。**

</div>
