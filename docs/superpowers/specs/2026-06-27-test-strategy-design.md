# MMD 测试策略

## 架构

```
tests/
├── vitest.workspace.ts
├── worker/
│   ├── utils.test.ts
│   ├── cache.test.ts
│   ├── rednote.test.ts
│   ├── rednote.fallback.test.ts
│   ├── twitter.test.ts
│   ├── twitter.fallback.test.ts
│   ├── twitter-html.test.ts
│   ├── parse.test.ts
│   ├── parse.fallback.test.ts
│   └── handlers.test.ts
└── frontend/
    ├── setup.ts
    ├── extractUrl.test.ts
    ├── hooks.test.ts
    ├── utils.test.ts
    ├── history.test.ts
    ├── api-contract.test.ts
    └── components/
        ├── VideoOptions.test.tsx
        ├── ImageOptions.test.tsx
        ├── AppContent.test.tsx
        └── PWAUpdatePrompt.test.tsx
```

## 分层执行

| 命令 | 范围 | 用途 |
|---------|-------|----------|
| `pnpm test` | 所有 `*.test.ts`（排除 `*.fallback.test.ts`） | 每次变更 |
| `pnpm test:full` | 所有测试 | 大版本发布/重构 |
| `pnpm test:fallback` | 仅 `*.fallback.test.ts` | 调试降级路径 |
| `pnpm test:watch` | 主测试套件，监听模式 | 开发 |

## 技术栈

| 层 | 运行器 | 运行时 | 目的 |
|-------|--------|---------|---------|
| Worker | Vitest + `@cloudflare/vitest-pool-workers` | workerd (miniflare) | 在真实运行时中运行 CF Worker 测试 — `HTMLRewriter`、`KVNamespace`、`fetch` 无需 mock |
| 前端 | Vitest + jsdom | Node.js | 单元 + 组件测试 |
| API 契约 | Vitest 编译时 | — | 前端/后端 `MediaResult` 类型形状兼容性 |

## Worker 测试

### 主测试套件（始终运行）

| 文件 | 测试内容 |
|------|---------------|
| `utils.test.ts` | `isRecord`/`getString`/`getNumber`/`getArray`/`getRecord` 边界情况，`resolveUrl` 重定向，`extractTwitterDimensions`/`extractTwitterQuality` |
| `cache.test.ts` | `getCacheKey` (xhs:/tw: 前缀)，`getCacheResult` 命中/未命中，`setCacheResult` 元数据 |
| `rednote.test.ts` | `window.__INITIAL_STATE__` 提取，视频/图片笔记解析，视频→图片降级，流排序/去重，3 次重试退避 |
| `twitter.test.ts` | fxtwitter 响应解析（视频/图片/tombstone），vxtwitter Tier 2 降级 |
| `twitter-html.test.ts` | HTMLRewriter OG meta 提取（视频/图片） |
| `parse.test.ts` | 路由分发（rednote/twitter/unknown），缓存命中 <12h 直接返回 |
| `handlers.test.ts` | image-proxy Referer 注入，download Content-Disposition |

### 降级测试套件（可选，`*.fallback.test.ts`）

| 文件 | 测试内容 |
|------|---------------|
| `rednote.fallback.test.ts` | `<script id="__INITIAL_STATE__">` 标签降级，Puppeteer SSR 降级，全部失败 |
| `twitter.fallback.test.ts` | fxtwitter+vxtwitter 均失败 → HTMLRewriter，全部 3 层失败 |
| `parse.fallback.test.ts` | 缓存 12h-3d 后台刷新，获取失败时返回过期缓存，无过期缓存时获取失败 |

## 前端测试

| 文件 | 测试内容 |
|------|---------------|
| `extractUrl.test.ts` | URL 提取，末尾标点清理，多个 URL，无 URL |
| `utils.test.ts` | `getErrorMessage`，`proxiedImage`，`formatBytes` |
| `history.test.ts` | 添加/去重/10 项限制/清空 |
| `hooks.test.ts` | `useHistoryState` localStorage 加载，`useDownload` URL 构建 + 流下载 |
| `api-contract.test.ts` | 运行时形状检查：worker `MediaResult` 字段与前端类型匹配 |
| `VideoOptions.test.tsx` | 格式列表渲染，分辨率/大小显示，下载点击 |
| `ImageOptions.test.tsx` | 缩略图网格渲染，逐图下载 |
| `AppContent.test.tsx` | 空/加载/错误/结果/历史/PWA 状态 |
| `PWAUpdatePrompt.test.tsx` | 更新按钮渲染和交互 |

## 依赖

### 根 `package.json`（前端）
- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `jsdom`

### `worker/package.json`（后端）
- `vitest`
- `@cloudflare/vitest-pool-workers`

## 配置

### `tests/vitest.workspace.ts`
两个项目：`worker`（池：`@cloudflare/vitest-pool-workers`，wrangler 配置）和 `frontend`（环境：jsdom，setup 文件）。

### `package.json` 脚本
五个新脚本：`test`、`test:full`、`test:fallback`、`test:frontend`、`test:worker`、`test:watch`。主测试套件排除 `**/*.fallback.test.ts`。降级测试套件仅包含它们。
