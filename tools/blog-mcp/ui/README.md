# blog-mcp admin UI

React + TypeScript + Vite, replacing the hand-rolled vanilla-JS UI that used
to live in `tools/blog-mcp/public/` (Milestone 9 — see
`../MILESTONES.md`). Talks to the same `serve`-mode backend over the exact
same `/api/*` + `/login`/`/logout` routes; nothing in `../src/` changed its
contract for this.

## Developing

```bash
# from tools/blog-mcp/ (the package root, not here)
npm run start:serve   # a real serve-mode backend on :8765
npm run dev:ui         # Vite dev server on :5173, proxying /api, /mcp,
                       # /healthz, /login, /logout to :8765
```

The backend's `BLOG_MCP_HTTP_ALLOWED_ORIGINS` must include
`http://localhost:5173` for the dev proxy to authenticate at all --
otherwise every request the Vite dev server proxies through still carries
the browser's real Origin (`http://localhost:5173`), which the backend
rejects by default. Not an issue in production: there the build output is
served from the exact same origin as the backend, so Origin always matches.

## Building

```bash
npm run build:ui   # from the package root; or `npm run build` from here
```

Fixed build target for the whole project: `../Dockerfile`'s `ui-build` stage
runs this and copies `dist/` into the runtime image, replacing the old
`COPY public ./public`. `../src/serve/static.ts` serves it through a
narrowly-scoped, traversal-safe file server (not a fixed route→file
allowlist like the old UI used) so Vite's normal hashed asset filenames get
long-lived immutable caching.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
