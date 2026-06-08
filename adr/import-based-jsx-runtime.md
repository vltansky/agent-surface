# import-based-jsx-runtime

- Date: 2026-05-28
- Owners: @vltansky
- Related: `agent-surface serve`, JSX/TSX local UI artifacts, shadcn-compatible components

## Context

JSX artifacts served by Agent Surface need to behave like small local React plugins.
Authors should be able to give the runtime a React file that imports common UI
components without forcing every artifact consumer to install the same component
packages.

The previous JSX runtime relied on a single browser script and public component
globals. That made simple examples work, but it did not match normal React
authoring, made local extension awkward, and forced component names into a
runtime namespace instead of letting source files use normal imports.

## Decision

We will make JSX/TSX serve mode import-based.

The runtime bundles the user entry file with esbuild before serving it. The
served page still injects React, ReactDOM, Tailwind CSS, and the `window.__as`
bridge, but user code imports UI modules through normal paths.

The default host-provided component surface starts with shadcn-style paths:

- `@/components/ui/button`
- `@/components/ui/card`
- `@/components/ui/input`
- `@/components/ui/textarea`
- `@/components/ui/badge`
- `@/lib/utils`

The `@/` alias resolves to the served root first. Local files override host
defaults, so users can replace a default component or add new local modules such
as `@/components/ui/date-picker`.

The runtime will not expose component globals such as `window.AS`,
`window.shadcn`, `AS.*`, or `shadcn.*`. The only global runtime contract kept for
JSX artifacts is the non-component bridge, including `window.__as.data`,
`window.__as.done`, `window.__as.cancel`, and related callback helpers.


## Alternatives Considered

- Public component globals: simple to inject, but not React-like, difficult to
  override locally, and too easy to couple artifacts to host-only namespaces.
  default open-source-oriented authoring contract.
- Require artifact authors to install shadcn locally: predictable for bundlers,
  but defeats the shared-runtime goal for small agent UI artifacts.
- Full application bundler/dev server: flexible, but heavier than the local
  one-file artifact workflow this package is meant to support.

## Consequences

- Positive: JSX artifacts can use normal React import syntax.
- Positive: users can override or extend the default UI surface with local files.
- Positive: runtime-provided defaults reduce per-artifact setup.
- Positive: unsupported imports fail before the browser opens.
- Negative: `serve` now depends on esbuild at runtime for JSX/TSX files.
- Negative: the host default component surface becomes an API that must evolve
  carefully.
- Follow-up: update downstream templates that adopted `AS.*` during
  the compatibility migration to use shadcn-style imports after this runtime
  lands and publishes.

## Implementation Notes

- `packages/agent-surface/src/jsx-bundler.ts` owns JSX/TSX import resolution and
  host default modules.
- `packages/agent-surface/src/browser-runtime.ts` owns the browser shell and bridge
  injection.
- `packages/agent-surface/src/serve.ts` builds JSX/TSX files before creating the
  browser shell.
- MDX keeps its constrained source-first component runtime and is not converted
  into arbitrary JSX bundling by this decision.

## Links

- PR: https://github.com/vltansky/agent-surface/pull/29
