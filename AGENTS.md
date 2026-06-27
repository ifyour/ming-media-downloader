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
