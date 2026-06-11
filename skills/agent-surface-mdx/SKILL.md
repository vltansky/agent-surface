---
name: agent-surface-mdx
description: Use when creating, serving, or sharing source-first MDX artifacts with Agent Surface: richer Markdown reports, shadcn-style previews, charts, Mermaid diagrams, Tailwind className, structured metadata routes, or .md to .mdx conversions.
---

# Agent Surface MDX

Create source-first `.mdx` artifacts that stay editable like Markdown while rendering as richer local review surfaces through Agent Surface.

Use this skill when the artifact is mostly text, but needs richer review structure: findings, evidence blocks, option/risk tables, charts, Mermaid diagrams, timelines, tabs, accordions, callouts, Tailwind layout, or structured metadata routes.

Use `.md` when portability and plain text matter most. Use `.html`, `.jsx`, or `.tsx` when the artifact needs arbitrary JavaScript, app state, project-local components, direct npm imports, or custom interaction.

## Serve

```bash
npx -y agent-surface serve <artifact>.mdx
```

For agent/browser QA, use a fixed port and avoid opening an unmanaged system browser:

```bash
npx -y agent-surface serve <artifact>.mdx --no-open --port 4173
```

Open `http://127.0.0.1:4173/` in the harness-native browser when available.

Agent Surface can also serve a remote MDX source URL directly:

```bash
npx -y agent-surface serve \
  https://github.com/vltansky/agent-surface/blob/master/examples/review.mdx
```

GitHub `blob` URLs are fetched through `gh api`, so private repositories work with the user's existing GitHub CLI authentication. Other HTTP(S) URLs are fetched as plain text with `curl`, then served by file extension.

## Agent Routes

Agent Surface exposes useful routes while serving MDX:

- `/` and `/index.html`: rendered human review page
- `/source.mdx`: exact editable source
- `/plain.md`: normalized plain text for agents and tooling
- `/metadata.json`: title, frontmatter, source hash, heading line numbers, section ranges/text, links, runtime mode, and component names

When the artifact is meant for agent consumption, inspect the machine-readable routes before summarizing or editing it:

```bash
curl -s http://127.0.0.1:4173/metadata.json | jq '.sections[] | {title, startLine, endLine}'
curl -s http://127.0.0.1:4173/plain.md
```

## Authoring Workflow

1. Map the current artifact contract: output path, filename, consumers, follow-on scripts, and whether anything parses the file as plain Markdown.
2. Choose format: `.md` for text-only, portable, or machine-ingested artifacts; `.mdx` for text-first artifacts that need review structure; `.html`, `.jsx`, or `.tsx` for custom apps, state, arbitrary imports, and complex interactive charts.
3. Write mostly Markdown. Import only the approved MDX components actually used.
4. Prefer simple agent-readable structure: headings, short lists, `Callout`, `SourceQuote`, `RiskTable`, `Timeline`, `Compare`, `DataTable`, charts, and fenced Mermaid diagrams.
5. Serve the artifact and visually inspect it.
6. Check `/source.mdx`, `/plain.md`, and `/metadata.json` when route behavior matters.
7. Use `/metadata.json` section ranges when a downstream agent or tool needs to navigate the artifact without reparsing the source.

See [MDX capabilities](references/mdx-capabilities.md) when you need component names, examples, or runtime limits.

## Frontmatter

Default shadcn-style mode:

```mdx
---
title: Project Brief
runtime: shadcn
---
```

## Recommended Report Shape

```mdx
---
title: Project Brief
runtime: shadcn
---

import { Badge, Callout, DataTable, RiskTable, SourceQuote } from 'agent-surface/mdx'
import { Card } from '@/components/ui/card'

# Project Brief

<Badge>Pre-research artifact</Badge>

<Callout>
One concise paragraph that tells reviewers what this artifact is deciding,
why it exists, and what kind of confidence it has.
</Callout>

<DataTable>
- Stage: discovery
- Surface: local preview
- Signal: review readiness
- Mode: MDX report
</DataTable>

## Findings

<Card>

- Main gap: what the reviewer needs to know.
- Evidence gap: what is still missing.
- Decision pressure: what should happen next.

</Card>

<SourceQuote>

- Source: local files, research notes, logs, screenshots, or user quotes.
- Constraint: what limits the recommendation.

</SourceQuote>

## Direction

<RiskTable>

- Primary path: recommended next move.
- Alternative: viable fallback and why it is weaker.
- Risk: what could make this wrong.

</RiskTable>
```

## Guardrails

- Do not import arbitrary packages in MDX.
- Do not import project-local components in MDX.
- Do not import shadcn packages directly; use approved `@/components/ui/...` imports or `agent-surface/mdx`.
- Use Tailwind through static string `className` or `class` attributes on approved MDX components.
- Keep Tailwind classes structural and readable.
- Use Agent Surface chart wrappers for simple charts.
- Use `.html`, `.jsx`, or `.tsx` for arbitrary chart libraries, filters, state, or custom JavaScript.
- Use fenced `mermaid` blocks for static diagrams.
