# MMD — Ming Media Downloader

<p align="center"><sub>English · <a href="README.zh-CN.md">简体中文</a></sub></p>

Download watermark-free videos and images from Xiaohongshu (RED) and X / Twitter.

> Paste a Xiaohongshu or X share link/text to extract original images and videos (watermark-free), with multi-resolution selection, download history, and shareable parse results.

## Features

- **Multi-platform support** — Parses Xiaohongshu notes (video + images) and X/Twitter tweets (video + images)
- **Watermark-free downloads** — The server fetches original media directly, with no watermark added
- **Multi-resolution selection** — Shows all available video resolutions (1080p / 720p / 480p, etc.) with file sizes
- **Smart URL extraction** — Paste share text containing a link; the URL is detected and extracted automatically
- **Share parse results** — Generates an 8-character share code (stored in KV for 7 days) that others can open directly
- **Download history** — Keeps the last 10 records locally, with one-click re-parsing
- **Real-time download progress** — Streaming progress bar based on `ReadableStream`
- **PWA support** — Works offline, installable to desktop, with automatic update prompts
- **Dark mode** — Follows the system theme, adapting to light and dark styles
- **Responsive design** — Built on the Geist design language, fully adapted for mobile and desktop

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 8 | Modern SPA framework |
| **Build** | Vite + LightningCSS + pnpm | Fast builds and CSS processing |
| **PWA** | vite-plugin-pwa + Workbox | Offline caching and auto updates |
| **Styling** | Geist design system + CSS Variables | Light/dark themes, responsive layout |
| **Backend** | Cloudflare Workers | Serverless edge computing |
| **Storage** | Cloudflare KV | Caching and share-code storage |
| **Deployment** | Cloudflare Workers (single deployment) | Frontend assets + API in one Worker, global edge |

## Getting Started

Requires Node.js ≥ 20 and pnpm ≥ 9.

```bash
pnpm install
pnpm dev        # frontend :5173 + backend :8787, /api/* proxied automatically
pnpm build      # typecheck + production bundle into dist/
pnpm test       # all main tests (pre-commit runs it automatically)
pnpm release    # build + deploy assets + API as one Worker
```

Additional test commands: `test:full` (incl. fallback tests), `test:worker`, `test:frontend`, `test:fallback`, `test:watch`.

> Pre-commit hook (`.githooks/pre-commit`) runs lint → build → test on every commit. Skip with `git commit --no-verify`.

Worker tests run in the Miniflare (workerd) runtime with real Cloudflare Workers APIs such as `HTMLRewriter` and `KVNamespace`. Frontend tests use a jsdom environment.

## Project Structure

```
ming-media-downloader/
├── frontend/
│   ├── src/                      # React SPA (entry main.tsx, hooks, components)
│   ├── public/                   # Static assets (icons, etc.)
│   ├── tests/                    # jsdom tests
│   ├── index.html                # SPA entry
│   ├── vite.config.ts            # Build config (dev proxy /api → :8787; outDir ../dist)
│   └── tsconfig.*.json           # Frontend typecheck
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point + routing (/api/*; other paths → SPA assets)
│   │   ├── parse.ts              # Parse orchestration
│   │   ├── rednote.ts            # Xiaohongshu parser
│   │   ├── twitter.ts            # X/Twitter parser
│   │   ├── handlers.ts           # Image / download proxies
│   │   ├── cache.ts              # KV cache
│   │   └── utils.ts              # CORS / JSON helpers
│   ├── tests/                    # workerd tests
│   ├── cloudflare.config.ts      # cf deploy/dev config (KV MMD_CACHE + ASSETS binding)
│   └── wrangler.toml             # Kept in sync for vitest-pool-workers
├── dist/                         # Frontend build output (deployed as Worker assets)
├── vitest.*.config.ts            # Test configs (root, per runtime)
├── tsconfig.json / tsconfig.test.json
├── scripts/                      # PWA icon generation
└── package.json                  # pnpm dev / release / test
```

Deploy with `pnpm release` (or `cd backend && cf deploy`): it builds the frontend and ships assets + API as one Worker.

Cloudflare resources required:

- **KV Namespace** `MMD_CACHE` — Caches parse results and share codes (expires after 7 days by default)
- **Browser Rendering** (optional) — Puppeteer rendering for Xiaohongshu SSR fallback

## Deployment Configuration

Bind the following resources to the Worker in the Cloudflare Dashboard:

| Binding | Type | Notes |
|---|---|---|
| `MMD_CACHE` | KV Namespace | Cache and share storage (required) |
| `BROWSER_RENDERING` | Browser Rendering | SSR fallback rendering (optional) |

## Architecture

```
User browser (React SPA + PWA)
    │
    │ /api/parse, /api/download, /api/image-proxy, /api/share
    ▼
Cloudflare Worker (static assets + API)
    │
    ├── parse.ts → rednote.ts (SSR HTML parsing)
    │             → twitter.ts (fxtwitter API)
    ├── cache.ts → KV (MMD_CACHE)
    ├── handlers.ts → image proxy / download proxy
    └── utils.ts → URL parsing / CORS
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/parse?url=...` | Parse a media link |
| `GET` | `/api/image-proxy?url=...` | Image proxy (Xiaohongshu Referer) |
| `GET` | `/api/download?url=...&name=...` | Media proxy download |
| `POST` | `/api/share` | Create a share link |
| `GET` | `/api/share?id=...` | Fetch a shared result |

## Acknowledgements

- [fxtwitter](https://fxtwitter.com/) — X/Twitter media parsing API
- [Geist](https://vercel.com/font) — Vercel design system font
- [Cloudflare Workers](https://workers.cloudflare.com/) — Edge computing platform
