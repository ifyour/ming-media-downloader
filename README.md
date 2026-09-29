# MMD — Ming Media Downloader

Download watermark-free videos and images from Xiaohongshu (RED) and X / Twitter.

> Paste a Xiaohongshu or X share link/text to extract original images and videos (watermark-free), with multi-resolution selection, download history, and shareable parse results.

<p align="center"><sub>English · <a href="README.zh-CN.md">简体中文</a></sub></p>

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

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Cloudflare account](https://dash.cloudflare.com/) (needed for deployment)

### Installation

```bash
pnpm install
```

### Local Development

Starts the frontend (`localhost:5173`) and backend (`localhost:8787`) together:

```bash
pnpm dev
```

The Vite dev server automatically proxies `/api/*` requests to the backend Worker.

### Build

```bash
pnpm build
```

TypeScript type-checking first, then Vite builds the production bundle into `dist/`.

### Preview Production Build

```bash
pnpm preview
```

### Lint

```bash
pnpm lint
```

### Testing

The project uses [Vitest](https://vitest.dev/) 4, covering the Worker backend and the React frontend.

| Command | Description |
|------|------|
| `pnpm test` | Run all main tests (excluding fallback tests) |
| `pnpm test:full` | Run the full test suite (including fallback tests) |
| `pnpm test:worker` | Run Worker backend tests only |
| `pnpm test:frontend` | Run frontend tests only |
| `pnpm test:fallback` | Run fallback-path tests only |
| `pnpm test:watch` | Watch mode |

```bash
pnpm test        # Run before every commit (pre-commit hook runs it automatically)
pnpm test:full   # Run before major releases
```

> A Git pre-commit hook (`.githooks/pre-commit`) runs `pnpm test && pnpm build` on every `git commit`. To skip it (e.g. for WIP), use `git commit --no-verify`.

Worker tests run in the Miniflare (workerd) runtime with real Cloudflare Workers APIs such as `HTMLRewriter` and `KVNamespace`. Frontend tests use a jsdom environment.

## Project Structure

Quick map: **`frontend/` = frontend · `backend/` = backend (serves both the API and the built frontend) · tests live inside each side · root holds shared configs.**

```
ming-media-downloader/
│  ── FRONTEND ──
├── frontend/
│   ├── src/                      # Frontend source (React SPA)
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Root component (state + logic)
│   │   ├── types.ts              # Type definitions
│   │   ├── extractUrl.ts         # URL extraction logic
│   │   ├── history.ts            # Download history (localStorage)
│   │   ├── hooks.ts              # Custom hooks
│   │   ├── components/           # UI components
│   │   └── index.css             # Global styles + Geist design tokens
│   ├── public/                   # Static assets (icons, etc.)
│   ├── tests/                    # jsdom tests (mirror src/)
│   ├── index.html                # SPA entry
│   ├── vite.config.ts            # Build config (dev proxy /api → :8787; outDir ../dist)
│   └── tsconfig.*.json           # Frontend typecheck
│
│  ── BACKEND ──
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point + routing (/api/*; other paths → SPA assets)
│   │   ├── parse.ts              # Parse orchestration
│   │   ├── rednote.ts            # Xiaohongshu parser
│   │   ├── twitter.ts            # X/Twitter parser
│   │   ├── handlers.ts           # Image / download proxies
│   │   ├── cache.ts              # KV cache
│   │   ├── types.ts              # Backend type definitions
│   │   └── utils.ts              # CORS / JSON helpers
│   ├── tests/                    # workerd tests (mirror src/)
│   ├── cloudflare.config.ts      # cf deploy/dev config (KV MMD_CACHE + ASSETS binding)
│   └── wrangler.toml             # Kept in sync for vitest-pool-workers
│
│  ── SHARED ──
├── dist/                         # Frontend build output (deployed as Worker assets)
├── vite.config.ts → frontend/    # (see frontend above)
├── vitest.frontend.config.ts     # Frontend test config
├── vitest.worker.config.ts       # Worker test config
├── tsconfig.json                 # Solution-style references
├── tsconfig.test.json            # Test typecheck
├── scripts/                      # Build helpers (PWA icon generation)
└── package.json                  # Script entry for both ends (pnpm dev/release/test)
```

Single deployment: `pnpm release` (or `cd backend && cf deploy`) ships the built frontend (`dist/`) and the API as one Worker.

Requires the following Cloudflare resources:

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
