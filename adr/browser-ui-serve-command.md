# browser-ui-serve-command

- Date: 2026-03-27
- Owners: @vltansky
- Related: `agent-surface`, local browser UI artifacts

## Context

Agent workflows sometimes need a local browser UI instead of another chat prompt.
Before this runtime existed, agent workflows that needed browser UI each used
their own ad-hoc approach: `python3 -m http.server`, `open file://`, Vite dev
servers, or bespoke local scripts. Those approaches did not consistently return
structured data to the agent, so the user often gave feedback via free-text chat
that the agent then had to parse.

## Decision

We will provide `agent-surface` as the shared SDK and CLI runtime for serving
local interactive browser artifacts.

The CLI exposes `agent-surface serve`. The SDK exposes the same runtime for wrapper
tools that need to keep their own command surface.
The runtime starts a local HTTP server, opens the browser unless disabled, and
waits for a structured JSON callback.

The command supports `.html`, `.jsx`, `.tsx`, and `.mdx` files. JSX/TSX files
are bundled by Agent Surface with React 18, Tailwind CSS, local imports, and
host-provided shadcn-style defaults. MDX files use the constrained source-first
MDX runtime documented in the README.
A bridge script is injected that provides `window.__as.done(data)`,
`window.__as.cancel()`, `window.__as.regenerate(data)`, and
`window.__as.subscribe(handler)`.

The default server timeout is 8 hours: long enough for course and review sessions
to remain open while the user works, but still bounded so abandoned servers
eventually exit.

## Alternatives Considered

- MCP Elicitation: protocol-native but limited to flat forms, with no rich layout or multi-step UI.
- MCP Apps: rich sandboxed iframes but requires host support that is not consistently available in agent CLIs.
- WebSocket-based server: bidirectional but more complex than the current single-submission and SSE watch needs.
- Electron or Tauri popup: heavy runtime, overkill for small local review flows.
- Short default timeout (5-10 minutes): rejected because browser UIs can be real review or learning sessions, and short CLI defaults silently discard in-progress work when users step away.

## Consequences

- Positive: skill and tool authors get one standardized local browser UI runtime.
- Positive: agents receive structured JSON instead of parsing free-text feedback.
- Positive: wrappers can depend on the SDK instead of copying serve logic.
- Negative: JSX mode depends on CDN-hosted browser packages.
- Negative: the runtime must maintain compatibility for both direct CLI users and SDK wrappers.
- Follow-up: richer artifact formats and static sharing should be documented in their own ADRs when they land in this package.

## Implementation Notes

- `packages/agent-surface/src/serve.ts` contains the runtime implementation.
- `packages/agent-surface/src/cli.ts` exposes the `agent-surface serve` CLI.
- `packages/agent-surface/src/index.ts` exports SDK APIs for wrappers.
- `packages/agent-surface/templates/` contains bundled starter templates.
- `README.md` documents user-facing CLI and SDK usage.

## Links

- Supersedes the original tool-specific ADR.
