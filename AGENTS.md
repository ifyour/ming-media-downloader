# MMD — Ming Media Downloader

## Architecture

- **Frontend** (`frontend/`): React 19 + TypeScript 6.0 + Vite 8. LightningCSS for CSS (not PostCSS/Sass). Source in `frontend/src/`, build output at repo-root `dist/`.
- **Backend** (`backend/`): Cloudflare Worker serving both the API and the frontend static assets (`dist/`) as a single deployment. In dev, Vite's `server.proxy` handles `/api/*` instead.
- **Entrypoints**: `frontend/src/main.tsx` (frontend), `backend/src/index.ts` (backend).

## Commands

```sh
pnpm dev              # concurrently starts Vite (:5173) + cf dev (:8787)
pnpm release          # build frontend, then single deploy (assets + API in one Worker)
pnpm build            # tsc -b (typecheck both tsconfigs) then vite build
```

## Quirks & gotchas

- `pnpm build` runs `tsc -b` before `vite build`. TypeScript errors block the build.
- `tsc -b` uses project references (`tsconfig.json` → `frontend/tsconfig.app.json` + `frontend/tsconfig.node.json`). Both must compile.
- `verbatimModuleSyntax` is on: type imports require `import type { ... }`.
- `erasableSyntaxOnly` is on: no enums, no namespaces, no parameter properties.
- TypeScript 6.0 — verify compatibility before upgrading any TS-adjacent dependency.
- LightningCSS CSS transformer targets Safari 11+ (iOS 12+). Not PostCSS — don't add PostCSS plugins/ config.
- The Worker requires KV namespace `MMD_CACHE` (hardcoded ID in `backend/cloudflare.config.ts`; `backend/wrangler.toml` kept in sync for vitest-pool-workers). Without it, cache and share features fail.
- Single Worker deployment: frontend assets + API. Deploy from `backend/` with `cf deploy`.
- PWA is enabled in dev mode (`devOptions.enabled: true`), so `dev-dist/` is generated.
- `pnpm-workspace.yaml` declares `allowBuilds` for esbuild, sharp, workerd — needed for `pnpm install` and wrangler.
- PWA icons generated from `public/favicon.svg` via `scripts/generate-pwa-icons.js`.
- `test:watch` only watches worker tests. Use `test:watch:frontend` for frontend.
- No CI workflows (`.github/` absent). Pre-commit hook is the only automated check.

## Testing

### Pre-commit hook

`.githooks/pre-commit` runs `pnpm lint && pnpm build && pnpm test` (fail-fast, each step depends on prior). Configured via `git config core.hooksPath .githooks`. Pass `--no-verify` to skip (WIP commits).

### Architecture

Two separate Vitest configs (Vitest 4 removed `defineWorkspace`):

| Config | Runtime | Scope |
|--------|---------|-------|
| `vitest.worker.config.ts` | workerd (via `@cloudflare/vitest-pool-workers`) | `backend/tests/**/*.test.ts` |
| `vitest.frontend.config.ts` | jsdom | `frontend/tests/**/*.test.ts` + `test.tsx` |

### File naming conventions

- `*.test.ts` — primary tests (always run)
- `*.fallback.test.ts` — optional degradation tests (excluded from `pnpm test`)

Worker tests use `cloudflareTest()` plugin API (vitest-pool-workers v0.13+). Mock KV via `as unknown as KVNamespace`, mock fetch via `vi.fn()` on `globalThis.fetch`.

### Commands

```sh
pnpm test              # worker (excl fallback) + frontend
pnpm test:full         # all tests
pnpm test:worker       # worker only (excl fallback)
pnpm test:frontend     # frontend only
pnpm test:fallback     # fallback-only
pnpm test:watch        # worker watch mode (only worker)
pnpm test:watch:frontend  # frontend watch mode
```

### Gotchas

- `--passWithNoTests` on most scripts keeps CI green when no test files exist
- Frontend tests: `import type { ... }` required (verbatimModuleSyntax). Worker tests: plain imports.
- Worker tests run in Miniflare — `HTMLRewriter`, `KVNamespace`, `fetch` all work natively, no mocks needed for those APIs.
- Fallback tests are slow (`setTimeout`-based retries, real network calls) — they're excluded from `pnpm test` for a reason.
- LSP type errors for vitest 4 types are expected (not all types published yet) — not runtime issues.
