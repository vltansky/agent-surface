# serve-extensions

- Date: 2026-06-08
- Owners: @vltansky
- Related: `agent-surface serve`, `serveUI`, `startServer`

## Context

Consumers need to run their own local HTTP routes and live source reload behavior
inside an Agent Surface session without forking the serve runtime. Forking copies
callback auth, SSE lifecycle, browser bridge behavior, static file serving, and
session handling, which makes wrappers drift from the package they are trying to
reuse.

The serve runtime previously exposed a hardcoded route table and built the entry
HTML once at startup, so higher-level tools had to choose between a separate
server or a stale preview after source edits.

## Decision

Agent Surface exposes two optional, backward-compatible serve extensions:

1. `extraRoutes`, passed through `ServeUIExtensions` to `serveUI` or
   `startServer`. A `ServeRoute` receives one `ServeRouteContext` and returns
   `true` when it handled the request or `false` to fall through. Built-in routes
   keep priority, and extra routes run before static file serving.
2. `--reload-on-change <glob>` with `--watch-ignore <glob>`, which broadcasts a
   debounced `reload` SSE event through the existing bridge. In live mode
   (`--watch` or `--reload-on-change`), the entry HTML is rebuilt per request so
   source edits appear after reload. One-shot forms and pickers keep the initial
   build.

Routes own their authorization checks through `ctx.isAuthorized()` and
`ctx.rejectUnauthorized()`. There is no blanket auth gate because static assets
remain intentionally readable from the local browser session.

## Consequences

- Positive: wrappers can reuse Agent Surface's native lifecycle, auth helpers,
  bridge, and static file behavior while adding only their own route handlers.
- Positive: local preview flows can reload edited source without replacing the
  whole serve stack.
- Negative: a custom route that forgets to call `ctx.isAuthorized()` can expose a
  local endpoint. File-system containment remains the route's responsibility; use
  `projectDir` and `rootDir` as the boundary inputs.
- Negative: per-request rebuild adds cost, but only in live preview mode.

## Implementation Notes

- `ServeRoute`, `ServeRouteContext`, and `ServeUIExtensions` live in
  `packages/agent-surface/src/serve/server.ts` and are re-exported from the
  package barrel.
- `buildEntryHtml(opts)` is exported from `packages/agent-surface/src/serve/entry.ts`
  so live mode can rebuild without making `server.ts` import the CLI entrypoint.
- `startReloadWatcher` shares the existing chokidar debounce constant with watch
  transforms and broadcasts `reload` over the existing SSE connection.
- The browser bridge handles `reload` by calling `window.location.reload()`.
