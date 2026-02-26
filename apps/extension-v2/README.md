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
