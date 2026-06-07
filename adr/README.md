# Architecture Decision Records

This directory stores durable ADRs for Agent Surface.

Use an ADR when a change does one of these:
- Introduces or reverses a repo convention
- Changes how contributors or agents are expected to work
- Changes CLI, SDK, runtime behavior, or cross-repo policy
- Needs durable rationale that should outlive the PR thread

Do not use an ADR for:
- Routine implementation details inside a single PR
- Temporary exploration notes or working drafts
- Small docs, test, or dependency maintenance changes with no durable policy

Why this repo uses ADRs:
- PR descriptions are useful during review but easy to lose later
- Root guidance should stay short and navigational
- Agents need a stable, skimmable place to recover past decisions quickly

Conventions:
- Location: `adr/`
- Naming: `short-kebab-case.md` (no numeric prefix -- avoids merge conflicts when multiple ADRs land in parallel)
- Scope: repo-level architecture, conventions, CLI/SDK contracts, and runtime policy
- Style: short sections with explicit decisions and trade-offs
- Metadata: omit a `Status` field; acceptance is tracked through PR review and merge history
- Lifecycle: supersede old ADRs with new ones instead of rewriting history
- Inventory: the `adr/` directory tree is the authoritative ADR inventory; do not maintain a per-ADR table in this file

Directory usage:
- Open the `adr/` folder to browse ADRs by filename
- Read [template.md](./template.md) when adding a new ADR
- Add a new ADR file in `adr/` when introducing or reversing a durable repo-level convention
- Avoid touching this README just to register another ADR

Template:
- [template.md](./template.md)
