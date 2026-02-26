# FRW Extension v2

A new browser extension stack based on `@crxjs/vite-plugin` + `Vite` with dual
surfaces:

- `popup` (quick actions)
- `side panel` (longer workflows)

## Commands

```bash
pnpm dev:extension:v2
pnpm build:extension:v2
```

## Dev + HMR Workflow

`extension-v2` uses `@crxjs/vite-plugin` (Vite dev server + extension
HMR/reload).

1. Start dev mode:

```bash
pnpm dev:extension:v2
```

2. In Chrome, open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked` and select: `apps/extension-v2/dist`
5. Keep the dev command running. UI files (`popup` / `sidepanel`) use HMR, and
   extension entry changes trigger reload updates.

Notes:

- Dev server is fixed at `127.0.0.1:5173` (`strictPort=true`) to avoid
  hot-reload mismatch caused by random port fallback.
- Monorepo source outside `apps/extension-v2` (for example
  `packages/wallet/src`) is explicitly allowed for watch/HMR.

## Architecture

- `manifest.config.ts`: MV3 manifest source (`crxjs` handles bundling)
- `src/background`: service worker (message bridge + side panel behavior)
- `src/popup`: popup entry
- `src/sidepanel`: side panel entry
- `src/shared`: shared UI + extension API contract

## Notes

- This app intentionally coexists with legacy `apps/extension` for incremental
  migration.
- Current state uses mock wallet data in background storage as bootstrap. Next
  step is wiring real FRW services/workflows into `src/background`.
