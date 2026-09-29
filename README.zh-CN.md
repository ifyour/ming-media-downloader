# MMD — Ming Media Downloader

<p align="center"><sub><a href="README.md">English</a> · 简体中文</sub></p>

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
| **部署** | Cloudflare Workers（单部署） | 前端资产 + API 同一 Worker，全球边缘节点 |

## 快速开始

需要 Node.js ≥ 20 和 pnpm ≥ 9。

```bash
pnpm install
pnpm dev        # 前端 :5173 + 后端 :8787，/api/* 自动代理
pnpm build      # 类型检查 + 生产构建到 dist/
pnpm test       # 全部主测试（pre-commit 自动执行）
pnpm release    # 构建 + 部署（资产 + API 单一 Worker）
```

其他测试命令：`test:full`（含降级测试）、`test:worker`、`test:frontend`、`test:fallback`、`test:watch`。

> pre-commit hook（`.githooks/pre-commit`）每次提交自动运行 lint → build → test。跳过用 `git commit --no-verify`。

Worker 测试在 Miniflare（workerd）运行时中执行，支持 `HTMLRewriter`、`KVNamespace` 等真实 Cloudflare Workers API。前端测试使用 jsdom 环境。

## 项目结构

```
ming-media-downloader/
├── frontend/
│   ├── src/                      # React SPA（入口 main.tsx、hooks、components）
│   ├── public/                   # 静态资源（图标等）
│   ├── tests/                    # jsdom 测试
│   ├── index.html                # SPA 入口
│   ├── vite.config.ts            # 构建配置（开发时 /api 代理到 :8787；输出 ../dist）
│   └── tsconfig.*.json           # 前端类型检查
├── backend/
│   ├── src/
│   │   ├── index.ts              # 入口 + 路由分发（/api/*；其它路径 → SPA 静态资产）
│   │   ├── parse.ts              # 解析编排
│   │   ├── rednote.ts            # 小红书解析器
│   │   ├── twitter.ts            # X/Twitter 解析器
│   │   ├── handlers.ts           # 图片/下载代理
│   │   ├── cache.ts              # KV 缓存
│   │   └── utils.ts              # CORS / JSON 工具
│   ├── tests/                    # workerd 测试
│   ├── cloudflare.config.ts      # cf 部署/开发配置（KV MMD_CACHE + ASSETS 绑定）
│   └── wrangler.toml             # 为 vitest-pool-workers 保留，需同步维护
├── dist/                         # 前端构建产物（作为 Worker 静态资产部署）
├── vitest.*.config.ts            # 测试配置（根目录，按运行时区分）
├── tsconfig.json / tsconfig.test.json
├── scripts/                      # PWA 图标生成
└── package.json                  # pnpm dev / release / test
```

部署用 `pnpm release`（或 `cd backend && cf deploy`）：构建前端后把资产 + API 作为单一 Worker 发布。

需要配置以下 Cloudflare 资源：

- **KV Namespace** `MMD_CACHE` — 缓存解析结果与分享码（默认 7 天过期）
- **Browser Rendering**（可选）— 小红书 SSR 降级时的 Puppeteer 渲染

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
Cloudflare Worker（静态资产 + API）
    │
    ├── parse.ts → rednote.ts（SSR HTML 解析）
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
