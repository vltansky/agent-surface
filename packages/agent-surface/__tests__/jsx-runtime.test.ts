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

describe("agent-surface jsx runtime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-serve-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("wraps JSX file with React + Tailwind shell", async () => {
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      `function App() {
  return <div className="p-4"><button onClick={() => window.__au.done({x: 1})}>Done</button></div>;
}`
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open", "--data", '{"items": [1,2,3]}'],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: { x: 1 } });
      }
    );

    expect(result.exitCode).toBe(0);
    // Should contain CDN scripts
    expect(pageBody).toContain("cdn.tailwindcss.com");
    expect(pageBody).toContain("unpkg.com/react@18");
    expect(pageBody).toContain("unpkg.com/react-dom@18");
    expect(pageBody).not.toContain("@babel/standalone");
    // Should contain the bundled component source
    expect(pageBody).toContain("function App()");
    // Should contain injected data
    expect(pageBody).toContain('"items"');
    // Should contain bridge
    expect(pageBody).toContain("window.__au");
  });

  it("passes --data to window.__au.data for JSX files", async () => {
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      'function App() { return <div>{JSON.stringify(window.__au.data)}</div>; }'
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open", "--data", '{"concepts": ["a","b"]}'],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('window.__au.data = {"concepts":["a","b"]}');
  });

  it("serves directory with index.jsx as entry-point", async () => {
    const dir = join(tmpDir, "myapp");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "index.jsx"),
      'function App() { return <div>DirApp</div>; }'
    );

    let pageBody = "";
    const result = await spawnServe(
      [dir, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("DirApp");
    expect(pageBody).toContain("cdn.tailwindcss.com");
  });

  it("bundles host shadcn defaults for JSX imports without component globals", async () => {
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      [
        'import { Button } from "@/components/ui/button";',
        'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";',
        'function App() {',
        '  return <Card><CardHeader><CardTitle>Host Card</CardTitle></CardHeader><CardContent><Button>Host Button</Button></CardContent></Card>;',
        '}',
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("Host Button");
    expect(pageBody).toContain("Host Card");
    expect(pageBody).toContain("function Button");
    expect(pageBody).not.toContain('from "@/components/ui/button"');
    expect(pageBody).not.toContain("window.shadcn");
    expect(pageBody).not.toContain("window.AU");
    expect(pageBody).not.toContain("shadcn.Button");
    expect(pageBody).not.toContain("AU.Button");
  });

  it("prefers local shadcn component overrides over host defaults", async () => {
    mkdirSync(join(tmpDir, "components", "ui"), { recursive: true });
    writeFileSync(
      join(tmpDir, "components", "ui", "button.jsx"),
      'export function Button({ children }) { return <button className="local-button">{children}</button>; }'
    );
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      [
        'import { Button } from "@/components/ui/button";',
        'function App() { return <Button>Local Button</Button>; }',
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("local-button");
    expect(pageBody).toContain("Local Button");
  });

  it("supports local shadcn-style extension modules", async () => {
    mkdirSync(join(tmpDir, "components", "ui"), { recursive: true });
    writeFileSync(
      join(tmpDir, "components", "ui", "date-picker.tsx"),
      'export function DatePicker() { return <div className="local-date-picker">Pick date</div>; }'
    );
    const jsxPath = join(tmpDir, "test.tsx");
    writeFileSync(
      jsxPath,
      [
        'import { DatePicker } from "@/components/ui/date-picker";',
        'function App() { return <DatePicker />; }',
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("local-date-picker");
    expect(pageBody).toContain("Pick date");
  });

  it("buildJsxBundleFromFiles bundles an in-memory entry and relative component", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { Panel } from "./Panel";',
          "function App() { return <Panel />; }",
        ].join("\n"),
        "Panel.tsx": 'export function Panel() { return <section className="virtual-panel">Virtual Panel</section>; }',
      },
    });

    expect(bundle).toContain("virtual-panel");
    expect(bundle).toContain("Virtual Panel");
  });

  it("buildJsxBundleFromFiles prefers in-memory shadcn overrides over host defaults", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { Button } from "@/components/ui/button";',
          "function App() { return <Button>Virtual Button</Button>; }",
        ].join("\n"),
        "components/ui/button.tsx": 'export function Button({ children }) { return <button className="virtual-button">{children}</button>; }',
      },
    });

    expect(bundle).toContain("virtual-button");
    expect(bundle).toContain("Virtual Button");
  });

  it("buildJsxBundleFromFiles supports caller host modules", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { Switch } from "@/components/ui/switch";',
          "function App() { return <Switch />; }",
        ].join("\n"),
      },
      hostModules: {
        "@/components/ui/switch": 'export function Switch() { return <button className="host-switch">Host Switch</button>; }',
      },
    });

    expect(bundle).toContain("host-switch");
    expect(bundle).toContain("Host Switch");
  });

  it("buildJsxBundleFromFiles lets virtual files beat caller host modules", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { Switch } from "@/components/ui/switch";',
          "function App() { return <Switch />; }",
        ].join("\n"),
        "components/ui/switch.tsx": 'export function Switch() { return <button className="virtual-switch">Virtual Switch</button>; }',
      },
      hostModules: {
        "@/components/ui/switch": 'export function Switch() { return <button className="host-switch">Host Switch</button>; }',
      },
    });

    expect(bundle).toContain("virtual-switch");
    expect(bundle).toContain("Virtual Switch");
    expect(bundle).not.toContain("host-switch");
  });

  it("buildJsxBundleFromFiles lets caller host modules override built-in fallbacks", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { Button } from "@/components/ui/button";',
          "function App() { return <Button>Host Override</Button>; }",
        ].join("\n"),
      },
      hostModules: {
        "@/components/ui/button": 'export function Button({ children }) { return <button className="host-button-override">{children}</button>; }',
      },
    });

    expect(bundle).toContain("host-button-override");
    expect(bundle).toContain("Host Override");
  });

  it("buildJsxBundleFromFiles fails unsupported bare imports clearly", async () => {
    await expect(buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import { uniq } from "lodash";',
          'function App() { return <div>{uniq(["x", "x"]).join(",")}</div>; }',
        ].join("\n"),
      },
    })).rejects.toThrow('Unsupported import "lodash"');
  });

  it("buildJsxBundleFromFiles resolves JSON virtual imports", async () => {
    const bundle = await buildJsxBundleFromFiles({
      entryFile: "App.tsx",
      files: {
        "App.tsx": [
          'import data from "./data.json";',
          "function App() { return <div className={data.className}>{data.label}</div>; }",
        ].join("\n"),
        "data.json": '{"className":"json-class","label":"JSON Label"}',
      },
    });

    expect(bundle).toContain("json-class");
    expect(bundle).toContain("JSON Label");
  });

  it("supports relative component imports in JSX entries", async () => {
    writeFileSync(
      join(tmpDir, "Panel.jsx"),
      'export function Panel() { return <section className="relative-panel">Relative panel</section>; }'
    );
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      [
        'import { Panel } from "./Panel";',
        'function App() { return <Panel />; }',
      ].join("\n")
    );

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("relative-panel");
    expect(pageBody).toContain("Relative panel");
  });

  it("uses the host cn helper unless a local utils module overrides it", async () => {
    const hostPath = join(tmpDir, "host-cn.jsx");
    writeFileSync(
      hostPath,
      [
        'import { cn } from "@/lib/utils";',
        'function App() { return <div className={cn("host-cn", ["array-cn"], { objectCn: true, skipped: false })}>CN</div>; }',
      ].join("\n")
    );

    let hostBody = "";
    const hostResult = await spawnServe(
      [hostPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        hostBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    mkdirSync(join(tmpDir, "lib"), { recursive: true });
    writeFileSync(
      join(tmpDir, "lib", "utils.js"),
      'export function cn() { return "local-cn"; }'
    );
    const localPath = join(tmpDir, "local-cn.jsx");
    writeFileSync(
      localPath,
      [
        'import { cn } from "@/lib/utils";',
        'function App() { return <div className={cn("ignored")}>Local CN</div>; }',
      ].join("\n")
    );

    let localBody = "";
    const localResult = await spawnServe(
      [localPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        localBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(hostResult.exitCode).toBe(0);
    expect(hostBody).toContain("objectCn");
    expect(hostBody).toContain("function cn");
    expect(localResult.exitCode).toBe(0);
    expect(localBody).toContain("local-cn");
  });

  it("fails unsupported bare JSX imports before opening the browser", async () => {
    const jsxPath = join(tmpDir, "bad-import.jsx");
    writeFileSync(
      jsxPath,
      [
        'import { uniq } from "lodash";',
        'function App() { return <div>{uniq(["x", "x"]).join(",")}</div>; }',
      ].join("\n")
    );

    const result = await spawnServe([jsxPath, "--no-open"], () => {
      throw new Error("server should not start for unsupported imports");
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported import "lodash"');
  });





  it("injects favicon link into JSX shell", async () => {
    const jsxPath = join(tmpDir, "fav.jsx");
    writeFileSync(jsxPath, 'function App() { return <div>Fav</div>; }');

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });
});
