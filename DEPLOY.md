# Ming Media Downloader

无水印下载小红书视频/图片，以及 X (Twitter) 高清推文视频的 Web 工具。

## 项目架构

项目采用**前后端分离**的双服务架构：

```
┌──────────────────────┐       /api/* 代理        ┌──────────────────────────┐
│   前端 (Vite + React)│  ──────────────────────▶  │  Worker (Cloudflare)     │
│   localhost:5173     │                           │  localhost:8787          │
└──────────────────────┘                           └──────────────────────────┘
```

| 模块 | 技术栈 | 目录 | 端口 |
|------|--------|------|------|
| 前端 | React 19 + TypeScript + Vite 8 | `src/` | 5173 |
| 后端 | Cloudflare Workers (Wrangler) | `worker/src/` | 8787 |

开发模式下，Vite 通过 `vite.config.ts` 中的 proxy 配置，将 `/api/*` 请求转发到 Worker 的 8787 端口。

## 工作原理

### 整体流程

```
用户粘贴链接 → 前端提取 URL → 调用 /api/parse → Worker 解析平台内容 → 返回媒体信息 → 用户选择画质下载
```

### 后端 Worker (`worker/src/index.ts`)

Worker 提供两个核心 API：

#### 1. `GET /api/parse?url=<目标链接>` — 解析媒体信息

根据 URL 域名路由到不同的解析策略：

**小红书解析 (`parseXiaohongshu`)**：
1. **短链解析**：如果 URL 是 `xhslink.com` 短链，先通过 `resolveUrl()` 手动跟随重定向获取真实地址
2. **页面抓取**：伪装浏览器 UA 请求小红书页面 HTML
3. **数据提取**：通过正则匹配 `window.__INITIAL_STATE__` 变量，从中解析出 JSON 格式的页面初始状态数据
4. **降级方案**：如果直接抓取拿不到数据（反爬），可启用 Cloudflare Browser Rendering（Puppeteer）渲染页面后再提取
5. **媒体提取**：
   - 视频：从 `note.video.media.stream` 中提取 h264/h265 所有流的 `masterUrl`，按分辨率降序排列
   - 图片：从 `note.imageList` 中提取所有 `urlDefault` 原图地址

**X/Twitter 解析 (`parseTwitter`)**：
1. 从 URL 中提取推文 Status ID
2. 调用第三方 [FixTweet API](https://api.fxtwitter.com/status/{id}) 获取推文结构化数据
3. 从 `tweet.media.all` 中筛选视频（mp4 格式，按 bitrate 排序）和图片

#### 2. `GET /api/download?url=<媒体地址>&name=<文件名>` — 代理下载

Worker 作为中间代理拉取远程媒体文件，关键处理：
- 设置 `Content-Disposition: attachment` 强制浏览器下载而非在线播放
- 设置 `Content-Type: application/octet-stream` 避免浏览器识别为可播放媒体
- 透传 CORS 头允许跨域

### 前端 (`src/App.tsx`)

纯 React 单页应用，核心功能：

- **链接输入**：支持从分享文本中自动正则提取 URL（兼容手机分享面板带装饰文本的场景）
- **结果展示**：展示作者信息、封面、标题描述，视频类型支持多画质选择
- **下载触发**：通过 `/api/download` 代理接口，`window.open` 新窗口触发下载
- **历史记录**：使用 `localStorage` 存储最近 10 条解析记录，支持点击回填重新解析

### `__INITIAL_STATE__` 解析器

这是小红书解析的核心难点。小红书的页面状态数据有两种格式：

1. **直接 JSON**：`window.__INITIAL_STATE__ = {...}`
2. **JSON.parse 包裹**：`window.__INITIAL_STATE__ = JSON.parse("...")`

解析器 `parseInitialState()` 的处理策略：
- 先正则提取 `=` 号后的内容
- 将 JS 的 `undefined` 替换为 `null`（合法 JSON）
- 如果是 `JSON.parse(...)` 格式，先解包内层字符串（处理引号转义），再二次 `JSON.parse`
- 全程使用纯 `JSON.parse`，不依赖 `eval` 或 `new Function`，安全性更好

## 本地开发

### 前置要求

- Node.js 18+
- pnpm（`npm install -g pnpm`）

### 安装依赖

```bash
# 根目录安装（前端依赖 + wrangler）
pnpm install
```

### 启动开发服务

需要同时启动两个服务：

```bash
# 终端 1：启动前端 Vite 开发服务器（端口 5173）
pnpm dev

# 终端 2：启动 Worker 本地开发服务器（端口 8787）
pnpm dev:worker
```

访问 `http://localhost:5173` 即可使用。Vite 会自动将 `/api/*` 请求代理到 Worker。

### 构建

```bash
pnpm build
```

构建产物输出到 `dist/` 目录。

## 部署

### 1. 部署 Worker（后端 API）

Worker 部署到 Cloudflare Workers：

```bash
# 登录 Cloudflare（首次需要）
pnpm exec wrangler login

# 部署
pnpm exec wrangler deploy worker/src/index.ts --name ming-media-downloader-api
```

部署成功后会获得一个 `https://ming-media-downloader-api.<your-subdomain>.workers.dev` 的地址。

**可选：启用 Browser Rendering（应对小红书反爬）**

编辑 `worker/wrangler.toml`，取消注释 browser binding：

```toml
[browser]
binding = "MYBROWSER"
```

> 注意：Browser Rendering 需要 Cloudflare Paid 计划。

### 2. 部署前端

前端可以部署到任何静态托管服务：

#### 方案 A：Cloudflare Pages

```bash
# 先构建
pnpm build

# 使用 wrangler 部署 Pages
pnpm exec wrangler pages deploy dist --project-name ming-media-downloader
```

#### 方案 B：Vercel

```bash
pnpm build
# 然后通过 vercel CLI 或 Web 界面部署 dist/ 目录
```

#### 方案 C：其他静态托管

将 `dist/` 目录部署到 Nginx / GitHub Pages / Netlify 等即可。

### 3. 生产环境 API 对接

部署到生产后，前端不再通过 Vite proxy 访问 Worker。需要配置 Nginx 反向代理或 CDN 规则，将 `/api/*` 路由到 Worker 地址：

```nginx
location /api/ {
    proxy_pass https://ming-media-downloader-api.<your-subdomain>.workers.dev;
    proxy_set_header Host ming-media-downloader-api.<your-subdomain>.workers.dev;
}
```

### 4. 配置自定义域名

假设你拥有的域名是 `example.com`，目标架构：

| 服务 | 域名 | 说明 |
|------|------|------|
| 前端页面 | `example.com` 或 `dl.example.com` | 静态站点入口 |
| Worker API | `api.example.com` | 后端解析/下载代理 |

> 前提：域名的 DNS 已托管在 Cloudflare（即 Nameserver 已迁移到 Cloudflare）。

#### 4.1 Worker 绑定自定义域名（api.example.com）

编辑 `worker/wrangler.toml`，添加 `routes` 配置：

```toml
name = "ming-media-downloader-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

routes = [
  { pattern = "api.example.com", custom_domain = true }
]

# [browser]
# binding = "MYBROWSER"
```

然后重新部署：

```bash
pnpm exec wrangler deploy
```

部署完成后，Cloudflare 会自动在 DNS 中创建一条 CNAME 记录，将 `api.example.com` 指向 Worker。访问 `https://api.example.com/api/parse?url=...` 即可直接调用。

> 也可以不写配置文件，在 Cloudflare Dashboard → Workers → ming-media-downloader-api → Triggers → Custom Domains 中手动添加。

#### 4.2 前端绑定自定义域名

**如果前端部署在 Cloudflare Pages：**

1. 进入 Dashboard → Pages → 你的项目 → Custom domains
2. 点击 **Set up a custom domain**
3. 输入域名，如 `example.com` 或 `dl.example.com`
4. Cloudflare 会自动配置 DNS 记录和 SSL 证书

**如果前端部署在其他平台（Vercel / Nginx 等）：**

在 Cloudflare DNS 面板手动添加记录：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| CNAME | `@` 或 `dl` | 指向托管平台提供的地址 | Proxied（橙色云朵）|

#### 4.3 生产环境前后端对接

使用自定义域名后，前端请求 `/api/*` 不再需要 Vite proxy，需要在你的托管层做反向代理。

**方案 A：Nginx 反向代理（推荐 VPS 部署）**

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    # 前端静态文件
    root /var/www/ming-media-downloader/dist;
    index index.html;

    # SPA 路由 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理到 Worker
    location /api/ {
        proxy_pass https://api.example.com;
        proxy_set_header Host api.example.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_ssl_server_name on;
    }
}
```

**方案 B：Cloudflare Pages + Worker 统一域名（推荐全 Cloudflare 部署）**

如果前端和 Worker 都部署在 Cloudflare，最简洁的方案是让 Pages 项目绑定主域名，然后通过 **Pages Functions**（`_worker.js`）将 `/api/*` 请求转发到 Worker，无需额外 Nginx 配置：

在项目根目录创建 `functions/api/` 目录，添加 `[[path]].ts`：

```typescript
// functions/api/[[path]].ts
export const onRequest: PagesFunction = async (context) => {
  const apiUrl = new URL(context.request.url);
  apiUrl.hostname = 'api.example.com';  // 指向你的 Worker 域名
  const response = await fetch(apiUrl.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });
  return response;
};
```

然后使用 `wrangler pages deploy` 部署时会自动识别 `functions/` 目录。

#### 4.4 SSL/TLS 证书

- Cloudflare 会自动为自定义域名签发免费的 SSL 证书（Universal SSL）
- 建议在 Dashboard → SSL/TLS 中将加密模式设为 **Full (Strict)**
- 证书会自动续期，无需手动管理

## 项目文件说明

```
├── src/                    # 前端源码
│   ├── App.tsx             # 主组件（解析表单、结果展示、历史记录）
│   ├── App.css             # 样式（Glassmorphism 风格，支持暗色模式）
│   ├── main.tsx            # 入口文件
│   └── index.css           # 全局样式
├── worker/                 # Cloudflare Worker 后端
│   ├── src/index.ts        # Worker 入口（解析逻辑 + 下载代理）
│   ├── wrangler.toml       # Wrangler 配置
│   └── package.json        # Worker 依赖
├── vite.config.ts          # Vite 配置（含 /api 代理）
├── index.html              # HTML 模板
└── package.json            # 前端依赖与脚本
```

## 支持的平台

| 平台 | 视频 | 图片 | 解析方式 |
|------|------|------|----------|
| 小红书 (xiaohongshu.com / xhslink.com / rednote.com) | ✅ 多画质 | ✅ 无水印原图 | 页面 HTML 解析 + Browser Rendering 降级 |
| X / Twitter (twitter.com / x.com) | ✅ 多画质 | ✅ 原图 | FixTweet API |
