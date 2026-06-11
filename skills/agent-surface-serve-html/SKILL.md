---
name: agent-surface-serve-html
description: Use when creating, serving, or sharing HTML/JSX/TSX interfaces with Agent Surface for local browser input, forms, pickers, dashboards, or review UIs.
---

# Agent Surface Serve HTML

Create a small local `.html`, `.jsx`, or `.tsx` interface, serve it with Agent Surface, and continue from the structured JSON returned by the browser.

Use this skill when the task needs browser input, forms, pickers, dashboards, local review UIs, React state, local components, Tailwind, or shadcn-style components without creating a full app.

Use `.mdx` instead when the artifact is mostly text and benefits from source/plain-text/metadata routes.

## Serve

Serve HTML:

```bash
npx -y agent-surface serve review.html --no-open --port 4173
```

Serve React JSX/TSX when the interface needs state, local components, or host-provided shadcn-style defaults:

```bash
npx -y agent-surface serve review.tsx --no-open --port 4173
```

With input data:

```bash
npx -y agent-surface serve review.html --data-file /tmp/review-data.json --no-open --port 4173
```

For long-running sessions where the output file matters:

```bash
npx -y agent-surface serve review.html --session-dir /tmp/agent-surface-session --no-open --port 4173
```

Serve a remote source URL directly when the UI already lives somewhere addressable:

```bash
npx -y agent-surface serve \
  https://github.com/vltansky/agent-surface/blob/master/examples/review.tsx \
  --no-open --port 4173
```

GitHub `blob` URLs are fetched through `gh api`, so private repositories work with the user's existing GitHub CLI authentication. Other HTTP(S) URLs are fetched as plain text with `curl`, then served by file extension.

## Minimal HTML

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Review</title>
  </head>
  <body>
    <h1>Review</h1>
    <button onclick="window.__as.done({ approved: true })">Approve</button>
    <button onclick="window.__as.cancel()">Cancel</button>
  </body>
</html>
```

## JSX And TSX

JSX/TSX files are bundled by Agent Surface before serving. The host provides React, ReactDOM, Tailwind, `window.__as`, and a small shadcn-compatible component surface through normal imports:

```tsx
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Card, {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { useState } from "react";

function App() {
  const { title = "Review" } = window.__as.data;
  const [note, setNote] = useState("");

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <Badge variant="outline">Agent Surface</Badge>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder="Reviewer" />
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => window.__as.cancel()}>
            Cancel
          </Button>
          <Button onClick={() => window.__as.done({ note })}>Submit</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
```

Built-in host imports:

- `@/components/ui/button`: `Button`
- `@/components/ui/card`: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `@/components/ui/input`: `Input`
- `@/components/ui/textarea`: `Textarea`
- `@/components/ui/badge`: `Badge`
- `@/lib/utils`: `cn`

Local files such as `components/ui/button.tsx` override built-in defaults. Local modules such as `components/ui/date-picker.tsx` can be imported as `@/components/ui/date-picker`.

There are no component globals. Use imports, not `window.AS`, `window.shadcn`, `AS.*`, or `shadcn.*`.

## Data Contract

Agent Surface injects:

- `window.__as.data`
- `window.__as.done(data)`
- `window.__as.cancel()`
- `window.__as.regenerate(data)` for multi-step flows that support regeneration

Keep returned JSON small: ids, selected values, free-text notes, approval state, priority values, or structured feedback.

Final payload shape:

```json
{"action":"done","data":{"approved":true,"note":"Looks ready."}}
```

## Guardrails

- Do not use `file://` previews; serve through the local Agent Surface HTTP server.
- Prefer `--data-file` over large inline JSON.
- Use `--no-open` when a harness-controlled browser will inspect the page.
- Avoid external network assets unless the task explicitly requires them.
- Use the public Agent Surface bridge: `window.__as`.
- Do not depend on component globals such as `AS.*` or `shadcn.*`; import components.
