# MMD — Ming Media Downloader

无水印下载小红书（RED）和 X / Twitter 视频与图片。

> 粘贴小红书或 X 的分享链接/文本，自动提取原图、原视频（无水印），支持多清晰度选择、下载历史记录和分享解析结果。

## 功能特性

- **多平台支持** — 解析小红书笔记（视频 + 图片）和 X/Twitter 推文（视频 + 图片）
- **无水印下载** — 服务端直接获取原始媒体，不添加任何水印
- **多清晰度选择** — 显示所有可用视频分辨率（1080p / 720p / 480p 等）及文件大小
- **智能 URL 提取** — 粘贴包含链接的分享文本，自动识别并提取 URL
- **分享解析结果** — 生成 8 位分享码（KV 存储 7 天），可发送给他人直接查看
- **下载历史** — 本地存储最近 10 条记录，支持一键重新解析
- **实时下载进度** — 基于 `ReadableStream` 的流式下载进度条
- **PWA 支持** — 离线可用，可安装到桌面，自动更新提示
- **深色模式** — 跟随系统主题，自适应明暗风格
- **响应式设计** — 基于 Geist 设计语言，移动端与桌面端完美适配

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| **前端** | React 19 + TypeScript + Vite 8 | 现代 SPA 框架 |
| **构建** | Vite + LightningCSS + pnpm | 高速构建与 CSS 处理 |
| **PWA** | vite-plugin-pwa + Workbox | 离线缓存与自动更新 |
| **样式** | Geist 设计系统 + CSS Variables | 明暗主题，响应式布局 |
| **后端** | Cloudflare Workers | 无服务器边缘计算 |
| **存储** | Cloudflare KV | 缓存与分享码存储 |
| **部署** | Cloudflare Pages + Workers | 全球 CDN 加速 |

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Cloudflare 账号](https://dash.cloudflare.com/)（部署时需要）

### 安装

```bash
pnpm install
```

### 本地开发

同时启动前端（`localhost:5173`）和后端（`localhost:8787`）：

```bash
pnpm dev
```

前端 Vite 开发服务器会自动将 `/api/*` 请求代理到后端 Worker。

### 构建

```bash
pnpm build
```

TypeScript 类型检查后，Vite 构建生产版本到 `dist/` 目录。

### 预览生产构建

```bash
pnpm preview
```

### 代码检查

```bash
pnpm lint
```

## 项目结构

```
ming-media-downloader/
├── src/                          # 前端源码
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 根组件（状态 + 逻辑）
│   ├── AppContent.tsx            # 展示组件（布局）
│   ├── types.ts                  # 类型定义
│   ├── extractUrl.ts             # URL 提取逻辑
│   ├── history.ts                # 下载历史（localStorage）
│   ├── hooks.ts                  # 自定义 Hooks
│   ├── utils.ts                  # 工具函数
│   ├── components/
│   │   ├── VideoOptions.tsx      # 视频格式选择
│   │   ├── ImageOptions.tsx      # 图片下载 UI
│   │   ├── PWAProvider.tsx       # PWA 更新管理
│   │   └── PWAUpdatePrompt.tsx   # 新版本提示
│   └── index.css                 # 全局样式 + Geist 设计 Token
├── worker/                       # Cloudflare Worker 后端
│   ├── src/
│   │   ├── index.ts              # 入口 + 路由分发
│   │   ├── parse.ts              # 解析编排
│   │   ├── xiaohongshu.ts        # 小红书解析器
│   │   ├── twitter.ts            # X/Twitter 解析器
│   │   ├── handlers.ts           # 图片/下载代理
│   │   ├── cache.ts              # KV 缓存
│   │   ├── types.ts              # 后端类型定义
│   │   └── utils.ts              # CORS / JSON 工具
│   └── wrangler.toml             # Worker 配置
├── functions/api/[[path]].ts     # Pages Function（代理到 Worker）
├── public/                       # 静态资源（图标等）
├── vite.config.ts                # Vite 配置
└── package.json                  # 前端依赖
```

## 部署

### 后端 Worker

```bash
pnpm deploy:backend
```

需要配置以下 Cloudflare 资源：

- **KV Namespace** `MMD_CACHE` — 缓存解析结果与分享码（默认 7 天过期）
- **Browser Rendering**（可选）— 小红书 SSR 降级时的 Puppeteer 渲染

### 前端 Pages

```bash
pnpm deploy:frontend
```

构建前端后部署到 Cloudflare Pages。`functions/api/[[path]].ts` 会将 API 请求代理到 Worker。

### 一键部署

```bash
pnpm deploy
```

## 部署配置

在 Cloudflare Dashboard 中为 Worker 绑定以下资源：

| 绑定 | 类型 | 说明 |
|---|---|---|
| `MMD_CACHE` | KV Namespace | 缓存与分享存储（必选） |
| `BROWSER_RENDERING` | Browser Rendering | SSR 降级渲染（可选） |

## 架构

```
用户浏览器 (React SPA + PWA)
    │
    │ /api/parse, /api/download, /api/image-proxy, /api/share
    ▼
Cloudflare Pages (functions/api/[[path]].ts)
    │  (代理到 Worker)
    ▼
Cloudflare Worker
    │
    ├── parse.ts → xiaohongshu.ts（SSR HTML 解析）
    │             → twitter.ts（fxtwitter API）
    ├── cache.ts → KV（MMD_CACHE）
    ├── handlers.ts → 图片代理 / 下载代理
    └── utils.ts → URL 解析 / CORS
```

### API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/parse?url=...` | 解析媒体链接 |
| `GET` | `/api/image-proxy?url=...` | 图片代理（小红书 Referer） |
| `GET` | `/api/download?url=...&name=...` | 媒体代理下载 |
| `POST` | `/api/share` | 创建分享链接 |
| `GET` | `/api/share?id=...` | 获取分享结果 |

## 致谢

- [fxtwitter](https://fxtwitter.com/) — X/Twitter 媒体解析 API
- [Geist](https://vercel.com/font) — Vercel 设计系统字体
- [Cloudflare Workers](https://workers.cloudflare.com/) — 边缘计算平台
