# AuroraMusic 官网落地页设计

日期：2026-08-31

## 背景与目标

为 AuroraMusic（Flyme Music）制作一个官方产品落地页，复用项目内现有的设计令牌、
品牌资产与 HyperOS 风格设计语言，与主应用完全隔离、可单独部署。

## 决策

- **定位**：单页长滚动产品落地页
- **方案**：独立 Vite 入口 + 原生 HTML/CSS/TS（无 React runtime）
- **主题**：浅色为主（`--am-bg` #F5F5F7 底 + 白 surface + #3D7BFF 主色）
- **动效**：适度——滚动淡入（IntersectionObserver）、Hero 环境光晕漂移、
  悬停上浮；`prefers-reduced-motion` 时全部禁用

## 文件结构

- `official.html`（根目录，第二入口）
- `src/official/main.ts`（滚动动画 + 导航交互）
- `src/official/official.css`（落地页样式；引用 `global.css` 的 `:root` 令牌，
  并覆盖 `body { overflow: hidden }` 等应用级样式）

## 页面板块

1. 导航栏：玻璃吸顶，aurora-mark + 字标 + 锚点 + CTA
2. Hero：大标题 + 副标题 + 双 CTA（体验 → `/`）+ 环境光晕背景
3. 特性展示：6 卡片网格（设计系统 / 沉浸式歌词 / 环境色播放器 / Provider 架构 /
   渐变封面 / 多主题），响应式 3/2/1 列
4. 界面预览：纯 CSS 还原迷你播放器卡片 + 歌曲列表项（均衡器 badge 动画），
   封面使用 mock 调色板渐变（如 #2C5FD8→#7FB0FF）
5. Footer：品牌简介 + 文档链接 + 版权

## 令牌约束

只复用 `--am-*` 变量（accent / radius / shadow / font / motion / ease），
不新造令牌值。玻璃效果仅用于顶部导航（遵守"玻璃稀缺"约束）。

## 验证

- `npm run build` 双入口构建通过、TS 无报错
- dev 服务器打开 `/official.html`，验证四个板块、
  响应式断点（≥960 / 640–960 / <640）与浅色主题渲染
