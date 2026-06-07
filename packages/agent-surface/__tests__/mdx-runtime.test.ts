import { createServer, request } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_UI_FAVICON_SVG,
  DEFAULT_SERVE_TIMEOUT_MS,
  buildJsxBundleFromFiles,
  fetchRemoteSource,
  injectBridge,
  parseGithubBlobUrl,
  startServer,
  type ServeOptions,
} from "../src/serve";
import { MDX_COMPONENT_NAMES } from "../src/mdx";
import { getPage, postCallback, runServedBridgeAction, spawnServe } from "./test-utils";

describe("agent-surface mdx runtime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-serve-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves MDX as rendered HTML and exposes source, plain text, and metadata routes", async () => {
    const mdxPath = join(tmpDir, "artifact.mdx");
    writeFileSync(
      mdxPath,
      [
        "---",
        "title: Test Artifact",
        "runtime: shadcn",
        "---",
        "import { Callout } from 'agent-surface/mdx'",
        "# Test Artifact",
        "",
        "Hello **world** with [a link](./next.mdx).",
        "",
        "<Callout>",
        "Important note",
        "</Callout>",
      ].join("\n")
    );

    let pageBody = "";
    let sourceBody = "";
    let plainBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        sourceBody = (await getPage(port, "/source.mdx")).body;
        plainBody = (await getPage(port, "/plain.md")).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("<h1>Test Artifact</h1>");
    expect(pageBody).toContain("<strong>world</strong>");
    expect(pageBody).toContain('data-component="Callout"');
    expect(pageBody).toContain("cdn.tailwindcss.com");
    expect(sourceBody).toContain("import { Callout }");
    expect(plainBody).toContain("[Component: Callout]");
    expect(plainBody).not.toContain("import { Callout }");
    expect(metadata.title).toBe("Test Artifact");
    expect(metadata.frontmatter).toEqual({ title: "Test Artifact", runtime: "shadcn" });
    expect(metadata.headings).toEqual([{ level: 1, text: "Test Artifact", line: 1 }]);
    expect(metadata.sections).toEqual([
      {
        level: 1,
        title: "Test Artifact",
        startLine: 1,
        endLine: 7,
        text: "Hello **world** with [a link](./next.mdx).\n\n<Callout>\nImportant note\n</Callout>",
      },
    ]);
    expect(metadata.runtimeMode).toBe("shadcn");
    expect(metadata.components).toEqual(["Callout"]);
    expect(metadata.links).toEqual([{ text: "a link", href: "./next.mdx" }]);
  });

  it("rejects unsupported MDX imports before serving", async () => {
    const mdxPath = join(tmpDir, "bad-import.mdx");
    writeFileSync(mdxPath, "import Thing from 'somewhere-else'\n\n# Bad");

    const result = await spawnServe(
      [mdxPath, "--no-open"],
      () => {}
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unsupported MDX import: somewhere-else");
  });

  it("rejects unknown Agent Surface MDX component imports before serving", async () => {
    const mdxPath = join(tmpDir, "bad-component-import.mdx");
    writeFileSync(mdxPath, "import { MysteryBox } from 'agent-surface/mdx'\n\n# Bad");

    const result = await spawnServe(
      [mdxPath, "--no-open"],
      () => {}
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown MDX component: MysteryBox");
  });

  it("allows the full shadcn MDX component surface and chart wrappers", async () => {
    const mdxPath = join(tmpDir, "shadcn-registry.mdx");
    writeFileSync(
      mdxPath,
      [
        "import { Alert, Badge, ButtonGroup, Card, ChartArea, ChartBar, ChartLine, ChartPie, Combobox, Direction, Empty, Field, InputGroup, Item, Kbd, NativeSelect, Progress, Spinner, Table, Typography } from 'agent-surface/mdx'",
        "# Shadcn Registry",
        "",
        "<Alert>",
        "Important artifact note",
        "</Alert>",
        "",
        "<Badge>",
        "Beta",
        "</Badge>",
        "",
        "<Card>",
        "A shadcn-style card",
        "</Card>",
        "",
        "<ButtonGroup />",
        "<Combobox />",
        "<Direction />",
        "<Empty />",
        "<Field />",
        "<InputGroup />",
        "<Item />",
        "<Kbd />",
        "<NativeSelect />",
        "<Spinner />",
        "<Typography />",
        "",
        "<Progress>",
        "Completion: 72",
        "</Progress>",
        "",
        "<Table>",
        "- Plan: MDX",
        "</Table>",
        "",
        "<ChartArea>",
        "- Jan: 12",
        "- Feb: 24",
        "- Mar: 18",
        "</ChartArea>",
        "",
        "<ChartBar>",
        "- Good: 8",
        "- Better: 13",
        "</ChartBar>",
        "",
        "<ChartLine>",
        "- First: 2",
        "- Second: 5",
        "</ChartLine>",
        "",
        "<ChartPie>",
        "- Research: 30",
        "- Design: 45",
        "- Build: 25",
        "</ChartPie>",
      ].join("\n")
    );

    let pageBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('data-component="Alert"');
    expect(pageBody).toContain('data-component="Card"');
    expect(pageBody).toContain('data-component="Progress"');
    expect(pageBody).toContain("au-mdx-progress-fill");
    expect(pageBody).toContain('data-component="ChartArea"');
    expect(pageBody).toContain("au-mdx-chart-area");
    expect(pageBody).toContain('data-component="ChartBar"');
    expect(pageBody).toContain("au-mdx-chart-bar");
    expect(pageBody).toContain('data-component="ChartLine"');
    expect(pageBody).toContain("au-mdx-chart-line");
    expect(pageBody).toContain('data-component="ChartPie"');
    expect(pageBody).toContain("conic-gradient");
    expect(metadata.components).toEqual([
      "Alert",
      "Badge",
      "ButtonGroup",
      "Card",
      "ChartArea",
      "ChartBar",
      "ChartLine",
      "ChartPie",
      "Combobox",
      "Direction",
      "Empty",
      "Field",
      "InputGroup",
      "Item",
      "Kbd",
      "NativeSelect",
      "Progress",
      "Spinner",
      "Table",
      "Typography",
    ]);
    expect(MDX_COMPONENT_NAMES).toContain("Card");
    expect(MDX_COMPONENT_NAMES).toContain("ChartArea");
    expect(MDX_COMPONENT_NAMES).toContain("ButtonGroup");
    expect(MDX_COMPONENT_NAMES).toContain("Typography");
  });

  it("accepts shadcn component imports in MDX like JSX serve", async () => {
    const mdxPath = join(tmpDir, "shadcn-imports.mdx");
    writeFileSync(
      mdxPath,
      [
        'import { Button } from "@/components/ui/button"',
        'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"',
        "# Shadcn Imports",
        "",
        "<Card>",
        "<CardHeader>",
        "<CardTitle>",
        "Host card",
        "</CardTitle>",
        "</CardHeader>",
        "<CardContent>",
        "<Button>",
        "Host button",
        "</Button>",
        "</CardContent>",
        "</Card>",
      ].join("\n")
    );

    let pageBody = "";
    let sourceBody = "";
    let plainBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        sourceBody = (await getPage(port, "/source.mdx")).body;
        plainBody = (await getPage(port, "/plain.md")).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('data-component="Card"');
    expect(pageBody).toContain('data-component="CardHeader"');
    expect(pageBody).toContain('data-component="CardTitle"');
    expect(pageBody).toContain('data-component="CardContent"');
    expect(pageBody).toContain('data-component="Button"');
    expect(pageBody).toContain("Host button");
    expect(sourceBody).toContain('from "@/components/ui/button"');
    expect(plainBody).not.toContain("@/components/ui/button");
    expect(metadata.components).toEqual(["Button", "Card", "CardContent", "CardHeader", "CardTitle"]);
  });

  it("preserves Tailwind class names on approved MDX components", async () => {
    const mdxPath = join(tmpDir, "tailwind-classes.mdx");
    writeFileSync(
      mdxPath,
      [
        "import { Callout, Separator, Spinner } from 'agent-surface/mdx'",
        "# Tailwind Classes",
        "",
        '<Callout className="border-red-500 bg-red-50 p-8 md:grid-cols-2">',
        "Styled instruction",
        "</Callout>",
        "",
        '<Separator class="my-10 border-blue-500" />',
        '<Spinner className={"size-6 text-emerald-600"} />',
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('class="au-mdx-component au-mdx-callout border-red-500 bg-red-50 p-8 md:grid-cols-2"');
    expect(pageBody).toContain('class="au-mdx-separator my-10 border-blue-500"');
    expect(pageBody).toContain('class="au-mdx-component au-mdx-spinner size-6 text-emerald-600"');
  });

  it("renders proposal-style report primitives and markdown tables", async () => {
    const mdxPath = join(tmpDir, "proposal.mdx");
    writeFileSync(
      mdxPath,
      [
        "---",
        "title: AICM Skills View Design",
        "runtime: shadcn",
        "---",
        "import {",
        "  DecisionTable,",
        "  Evidence,",
        "  ExecutiveSummary,",
        "  Finding,",
        "  MetricStrip,",
        "  RiskTable,",
        "  Timeline,",
        "} from 'agent-surface/mdx'",
        "# AICM Skills View Design",
        "",
        "<ExecutiveSummary>",
        "Add `aicm skills view <skill>` as a read-only way for agents to fetch a marketplace skill without installing it.",
        "</ExecutiveSummary>",
        "",
        "<MetricStrip>",
        "- Stage: shaped design",
        "- Consumer: agent",
        "- Build verdict: READY",
        "</MetricStrip>",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Default output | raw Markdown |",
        "| Structured mode | `--json` |",
        "",
        "## Recommendation",
        "",
        "<Finding>",
        "- Command: `aicm skills view <skill>`",
        "- Mutation policy: no config, lockfile, or target writes",
        "</Finding>",
        "",
        "<Evidence>",
        "- Existing resolver: `loadMarketplaceSkill` already resolves marketplace skills for install",
        "- Runtime need: `view` must stop before install writes",
        "</Evidence>",
        "",
        "<DecisionTable>",
        "- Primary path: raw Markdown default plus `--json` provenance",
        "- Alternative: `skills get <skill>` is shorter but less explicit",
        "- Risk: plugin-bundled skills need separate namespacing decisions",
        "</DecisionTable>",
        "",
        "<RiskTable>",
        "- Stale API catalog: resolve content through GitHub-backed registry",
        "- Accidental writes: keep the resolver pure and covered by tests",
        "</RiskTable>",
        "",
        "<Timeline>",
        "- E2E: add failing command tests",
        "- Resolver: expose read-only skill content",
        "- Docs: update skill workflow references",
        "</Timeline>",
      ].join("\n")
    );

    let pageBody = "";
    let plainBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        plainBody = (await getPage(port, "/plain.md")).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('data-component="ExecutiveSummary"');
    expect(pageBody).toContain("au-mdx-executive-summary");
    expect(pageBody).toContain('data-component="MetricStrip"');
    expect(pageBody).toContain("au-mdx-metric-grid");
    expect(pageBody).toContain("<th>Field</th>");
    expect(pageBody).toContain("<td>raw Markdown</td>");
    expect(pageBody).not.toContain("| Field | Value |");
    expect(pageBody).toContain('data-component="Finding"');
    expect(pageBody).toContain('data-component="Evidence"');
    expect(pageBody).toContain("au-mdx-decision-table");
    expect(pageBody).toContain('data-component="RiskTable"');
    expect(pageBody).toContain('data-component="Timeline"');
    expect(plainBody).toContain("[Component: ExecutiveSummary]");
    expect(plainBody).not.toContain("DecisionTable,");
    expect(plainBody).not.toContain("from 'agent-surface/mdx'");
    expect(metadata.components).toEqual([
      "DecisionTable",
      "Evidence",
      "ExecutiveSummary",
      "Finding",
      "MetricStrip",
      "RiskTable",
      "Timeline",
    ]);
  });

  it("publishes the agent-surface/mdx component subpath", async () => {
    const mdxModulePath = pathToFileURL(join(import.meta.dirname, "..", "dist", "mdx.js")).href;
    const mdxModule = await import(mdxModulePath);

    expect(mdxModule.MDX_COMPONENT_NAMES).toContain("Card");
    expect(mdxModule.MDX_COMPONENT_NAMES).toContain("ChartArea");
    expect(mdxModule.MDX_COMPONENT_NAMES).toContain("ButtonGroup");
    expect(mdxModule.MDX_COMPONENT_NAMES).toContain("Typography");
    expect(mdxModule.MDX_COMPONENTS.Card).toBe(mdxModule.Card);
    expect(Object.isFrozen(mdxModule.MDX_COMPONENTS)).toBe(true);
    expect(typeof mdxModule.Card).toBe("function");
    expect(typeof mdxModule.ChartArea).toBe("function");
    expect(typeof mdxModule.ButtonGroup).toBe("function");
    expect(typeof mdxModule.Typography).toBe("function");

    const Override = () => null;
    const components = mdxModule.createMdxComponents({ Card: Override });
    expect(components.Card).toBe(Override);
    expect(components.ChartArea).toBe(mdxModule.ChartArea);
    expect(mdxModule.useMDXComponents({ Card: Override }).Card).toBe(Override);
  });

  it("ignores JSX-looking examples inside MDX code blocks and inline code", async () => {
    const mdxPath = join(tmpDir, "code-sample.mdx");
    writeFileSync(
      mdxPath,
      [
        "# Code Sample",
        "",
        "Inline `<Button />` should stay code.",
        "",
        "```tsx",
        "import Button from 'some-ui-kit'",
        "<Button>",
        "  Click me",
        "</Button>",
        "```",
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("&lt;Button /&gt;");
    expect(pageBody).toContain("some-ui-kit");
    expect(pageBody).not.toContain("<Button>");
  });

  it("highlights MDX fenced code blocks while keeping code content escaped", async () => {
    const mdxPath = join(tmpDir, "highlighted-code.mdx");
    writeFileSync(
      mdxPath,
      [
        "# Highlighted Code",
        "",
        "```bash",
        "yarn test --watch",
        "```",
        "",
        "```shell",
        "echo \"$HOME\" && rg --files",
        "```",
        "",
        "```json",
        '{ "ok": true, "danger": "<script>alert(1)</script>" }',
        "```",
        "",
        "```tsx",
        "const Example = () => <Button label=\"Go\" />;",
        "```",
        "",
        "```ts",
        "type Result = { ok: boolean };",
        "```",
        "",
        "```jsx",
        "function App() { return <img src=x onerror=alert(1) />; }",
        "```",
        "",
        "```js",
        "const done = true;",
        "```",
        "",
        "```",
        "<span onclick=\"alert(1)\">plain fallback</span>",
        "```",
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("au-mdx-code-block");
    expect(pageBody).toContain("language-bash");
    expect(pageBody).toContain("language-shell");
    expect(pageBody).toContain("language-json");
    expect(pageBody).toContain("language-tsx");
    expect(pageBody).toContain("language-ts");
    expect(pageBody).toContain("language-jsx");
    expect(pageBody).toContain("language-js");
    expect(pageBody).toContain("language-plaintext");
    expect(pageBody).toContain("au-mdx-token-keyword");
    expect(pageBody).toContain("au-mdx-token-property");
    expect(pageBody).toContain("au-mdx-token-string");
    expect(pageBody).toContain("au-mdx-token-variable");
    expect(pageBody).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(pageBody).toContain("Button label");
    expect(pageBody).toContain("img src");
    expect(pageBody).toContain("&lt;span onclick=&quot;alert(1)&quot;&gt;plain fallback&lt;/span&gt;");
    expect(pageBody).not.toContain("<script>alert(1)</script>");
    expect(pageBody).not.toContain("<Button");
    expect(pageBody).not.toContain("<img src=x onerror=alert(1)");
    expect(pageBody).not.toContain("<span onclick=\"alert(1)\">plain fallback</span>");
  });

  it("renders MDX mermaid fenced code blocks as diagrams", async () => {
    const mdxPath = join(tmpDir, "diagram.mdx");
    writeFileSync(
      mdxPath,
      [
        "# Mermaid Diagram",
        "",
        "```mermaid",
        "flowchart LR",
        "  A[Agent] --> B{Review}",
        "  B --> C[Done]",
        "```",
      ].join("\n")
    );

    let pageBody = "";
    let plainBody = "";
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        plainBody = (await getPage(port, "/plain.md")).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    expect(pageBody).toContain("mermaid.initialize");
    expect(pageBody).toContain('<div class="au-mdx-mermaid">');
    expect(pageBody).toContain('<pre class="mermaid">flowchart LR');
    expect(pageBody).toContain("A[Agent] --&gt; B{Review}");
    expect(pageBody).not.toContain("language-mermaid");
    expect(plainBody).toContain("```mermaid");
  });

  it("renders unsafe MDX link protocols as plain text and omits them from metadata", async () => {
    const mdxPath = join(tmpDir, "unsafe-link.mdx");
    writeFileSync(
      mdxPath,
      [
        "# Links",
        "",
        "[safe](https://example.com) [relative](./next.mdx) [unsafe](javascript:alert(1)) [data](data:text/html,boom)",
      ].join("\n")
    );

    let pageBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('<a href="https://example.com">safe</a>');
    expect(pageBody).toContain('<a href="./next.mdx">relative</a>');
    expect(pageBody).not.toContain("javascript:alert");
    expect(pageBody).not.toContain("data:text/html");
    expect(metadata.links).toEqual([
      { text: "safe", href: "https://example.com" },
      { text: "relative", href: "./next.mdx" },
    ]);
  });



  it("parses MDX frontmatter with BOM and CRLF line endings", async () => {
    const mdxPath = join(tmpDir, "frontmatter-crlf.mdx");
    writeFileSync(mdxPath, "\uFEFF---\r\ntitle: CRLF Artifact\r\nruntime: shadcn\r\n---\r\n# CRLF Frontmatter");

    let pageBody = "";
    let metadata: Record<string, unknown> = {};
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        pageBody = (await getPage(port)).body;
        metadata = JSON.parse((await getPage(port, "/metadata.json")).body);
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("cdn.tailwindcss.com");
    expect(metadata.title).toBe("CRLF Artifact");
    expect(metadata.runtimeMode).toBe("shadcn");
  });

  it("MDX static path protections still reject traversal attempts", async () => {
    const mdxPath = join(tmpDir, "safe.mdx");
    writeFileSync(mdxPath, "# Safe");

    let status = 0;
    const result = await spawnServe(
      [mdxPath, "--no-open"],
      async (port) => {
        status = (await getPage(port, "/..%2Fsource.mdx")).status;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(status).toBe(403);
  });
});
