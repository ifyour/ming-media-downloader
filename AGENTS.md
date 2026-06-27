# MMD — Ming Media Downloader

## Architecture

- **Frontend** (`src/`): React 19 + TypeScript + Vite 8. LightningCSS for CSS (not PostCSS/Sass).
- **Backend** (`worker/`): Cloudflare Worker, source at `worker/src/index.ts`.
- **Pages Function** (`functions/api/[[path]].ts`): proxies `/api/*` to the deployed Worker at a hardcoded origin. In dev, Vite's `server.proxy` handles this instead.
- **Entrypoints**: `src/main.tsx` (frontend), `worker/src/index.ts` (backend).

## Commands

```sh
pnpm dev              # concurrently starts Vite (:5173) + wrangler dev (:8787)
pnpm build            # tsc -b (typecheck both tsconfigs) then vite build
pnpm lint             # eslint .
pnpm preview          # vite preview
pnpm deploy           # backend then frontend
pnpm deploy:backend   # wrangler deploy worker/src/index.ts
pnpm deploy:frontend  # build → wrangler pages deploy dist
```

## Quirks & gotchas

- `pnpm build` runs `tsc -b` before `vite build`. TypeScript errors block the build.
- `tsc -b` uses project references (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`). Both must compile.
- `verbatimModuleSyntax` is on: type imports require `import type { ... }`.
- `erasableSyntaxOnly` is on: no enums, no namespaces, no parameter properties.
- The Worker requires KV namespace `MMD_CACHE` (hardcoded ID in `wrangler.toml`). Without it, cache and share features fail.
- The Pages Function hardcodes the Worker URL — update if deploying to a different account/domain.
- PWA is enabled in dev mode (`devOptions.enabled: true`), so `dev-dist/` is generated.
- `pnpm-workspace.yaml` declares `allowBuilds` for esbuild, sharp, workerd — needed for `pnpm install` and wrangler.

## Testing

### Architecture

Two separate Vitest configs (Vitest 4 removed `defineWorkspace`):

| Config | Runtime | Scope |
|--------|---------|-------|
| `vitest.worker.config.ts` | workerd (via `@cloudflare/vitest-pool-workers`) | `tests/worker/**/*.test.ts` |
| `vitest.frontend.config.ts` | jsdom | `tests/frontend/**/*.test.ts` + `test.tsx` |

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
pnpm test:watch        # worker watch mode
pnpm test:watch:frontend  # frontend watch mode
```

### Gotchas

- `--passWithNoTests` on most scripts keeps CI green when no test files exist
- Frontend tests: `import type { ... }` required (verbatimModuleSyntax). Worker tests: plain imports.
- Worker tests run in Miniflare — `HTMLRewriter`, `KVNamespace`, `fetch` all work natively, no mocks needed for those APIs.
- Fallback tests are slow (`setTimeout`-based retries, real network calls) — they're excluded from `pnpm test` for a reason.
- LSP type errors for vitest 4 types are expected (not all types published yet) — not runtime issues.
