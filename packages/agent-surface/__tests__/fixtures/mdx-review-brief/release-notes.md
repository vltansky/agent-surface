# Release Note Draft

## Feature

Agent Surface now serves source-first MDX review briefs with `/source.mdx`, `/plain.md`, and `/metadata.json` routes.

## Audience

Coding-agent users who need to share a local review artifact with teammates before turning it into a longer-lived document.

## Known Risk

The draft does not yet explain when to choose MDX instead of HTML or JSX, so users may pick the wrong artifact type for interactive workflows.

## Acceptance Notes

- Mention the machine-readable routes.
- Explain that MDX is best for text-first review packets.
- Call out that HTML or JSX is better when the artifact needs local state or custom interaction.
