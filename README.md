# Flyme Music

一款具有 **Xiaomi HyperOS 设计语言**、融合现代音乐播放器体验的高级音乐应用。

> HyperOS + 现代音乐播放器 + 高级简约 + 轻量 Liquid Glass

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

### 已知限制

- Android 下载写入应用专属目录（作用域存储），文件管理器路径为 Android/data/com.flyme.music/files/Download/FlymeMusic；写入公共 Download 需要 MediaStore，属后续增强
- 打包应用内取消 AI 请求只会停止前端渲染，Rust 侧的上游请求会自然结束
- 应用图标源图固定为 src-tauri/icons/app-icon.png，换图标必须重跑 npx tauri icon
- 打包应用内经 plugin-http 发出的请求会带上 Origin: http://tauri.localhost（Windows）或 tauri://localhost（macOS/Linux/Android），这是 Rust 侧强制注入的，无法移除

## 更换应用图标

1. 用 1024x1024 的 PNG 覆盖 `src-tauri/icons/app-icon.png`
2. 运行 `npx tauri icon src-tauri/icons/app-icon.png`
3. 重新打包。桌面图标写入 `src-tauri/icons/`，Android 图标写入 `src-tauri/gen/android/app/src/main/res/mipmap-*`

## 官网落地页

项目采用 Vite 双入口：主应用（`index.html`）与官网落地页（`official.html`）完全隔离、可单独部署。

- 开发访问：`http://localhost:5173/official.html`
- 构建产物：`dist/official.html`（无 React runtime，gzip 后约 5 kB）
- 样式复用 `src/styles/global.css` 的 `--am-*` 设计令牌，源码位于 `src/official/`

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
