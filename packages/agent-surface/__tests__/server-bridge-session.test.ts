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

describe("agent-surface server bridge session", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-serve-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves HTML file and returns done callback as JSON", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(
      htmlPath,
      '<html><body><button onclick="window.__au.done({picked: true})">Go</button></body></html>'
    );

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      (port) => {
        postCallback(port, { action: "done", data: { picked: true } });
      }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output).toEqual({ action: "done", data: { picked: true } });
  });

  it("executes the injected window.__au.done bridge against the live server", async () => {
    const htmlPath = join(tmpDir, "bridge-done.html");
    writeFileSync(htmlPath, "<html><body>Bridge test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        await runServedBridgeAction(page.body, (windowObject) => {
          windowObject.__au!.done({ picked: true, source: "bridge" });
        });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      action: "done",
      data: { picked: true, source: "bridge" },
    });
  });

  it("executes the injected window.__au.cancel bridge against the live server", async () => {
    const htmlPath = join(tmpDir, "bridge-cancel.html");
    writeFileSync(htmlPath, "<html><body>Bridge cancel test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        await runServedBridgeAction(page.body, (windowObject) => {
          windowObject.__au!.cancel();
        });
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toEqual({ action: "cancel" });
  });

  it("returns exit code 1 on cancel", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html><body>Cancel test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      (port) => {
        postCallback(port, { action: "cancel" });
      }
    );

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout.trim());
    expect(output).toEqual({ action: "cancel" });
  });

  it("injects bridge script into served HTML", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html><body><p>Hello</p></body></html>");

    let pageBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        // Now close the server via callback
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("window.__au");
    expect(pageBody).toContain("window.__au.done");
    expect(pageBody).toContain("window.__au.cancel");
    expect(pageBody).toContain("/callback");
  });

  it("exits with code 2 on timeout", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html><body>Timeout test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open", "--timeout", "500"],
      () => {
        // Don't post anything — let it time out
      }
    );

    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout.trim());
    expect(output).toEqual({ action: "timeout" });
  });

  it("prints serving URL to stderr", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html><body>Stderr test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      (port) => {
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.stderr).toMatch(/Serving at http:\/\/127\.0\.0\.1:\d+/);
  });

  it("returns 404 for unknown paths", async () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html><body>404 test</body></html>");

    let notFoundStatus = 0;
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const resp = await new Promise<number>((resolve, reject) => {
          const req = request(
            { hostname: "127.0.0.1", port, path: "/random", method: "GET" },
            (res) => resolve(res.statusCode ?? 0)
          );
          req.on("error", reject);
          req.end();
        });
        notFoundStatus = resp;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(notFoundStatus).toBe(404);
  });

  it("returns regenerate as the final action and exits", async () => {
    const htmlPath = join(tmpDir, "multi.html");
    writeFileSync(htmlPath, "<html><body>Multi test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        await postCallback(port, { action: "regenerate", data: { id: "concept-1" } });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ action: "regenerate", data: { id: "concept-1" } });
  });

  it("--session-dir uses the supplied path and writes feedback.json there", async () => {
    const htmlPath = join(tmpDir, "session-dir.html");
    writeFileSync(htmlPath, "<html><body>Session-dir test</body></html>");
    const customSession = join(tmpDir, "custom-session");

    const result = await spawnServe(
      [htmlPath, "--no-open", "--session-dir", customSession],
      (port) => {
        postCallback(port, { action: "done", data: { ok: true } });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(customSession);
    expect(existsSync(join(customSession, "feedback.json"))).toBe(true);
    const feedback = JSON.parse(readFileSync(join(customSession, "feedback.json"), "utf-8"));
    expect(feedback).toEqual({ action: "done", data: { ok: true } });
    expect(existsSync(join(customSession, "session.json"))).toBe(true);
  });

  it("serves /favicon.svg with the AU logo", async () => {
    const htmlPath = join(tmpDir, "fav.html");
    writeFileSync(htmlPath, "<html><head></head><body>Favicon test</body></html>");

    let faviconResp: { status: number; body: string; headers: Record<string, string> } | undefined;
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        faviconResp = await getPage(port, "/favicon.svg");
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(faviconResp!.status).toBe(200);
    expect(faviconResp!.headers["content-type"]).toBe("image/svg+xml");
    expect(faviconResp!.body).toBe(AGENT_UI_FAVICON_SVG);
  });

  it("injects favicon link into raw HTML with <head>", async () => {
    const htmlPath = join(tmpDir, "fav-raw.html");
    writeFileSync(htmlPath, "<html><head><title>Test</title></head><body>Fav raw</body></html>");

    let pageBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it("bridge script has no syntax errors (no unescaped quotes)", async () => {
    const jsxPath = join(tmpDir, "syntax-test.jsx");
    writeFileSync(
      jsxPath,
      'function App() { return <div>Syntax test</div>; }'
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

    // Extract the bridge IIFE and verify it parses as valid JS
    const bridgeMatch = pageBody.match(/\(function\(\)\s*\{[\s\S]*?var baseUrl[\s\S]*?\}\)\(\);/);
    expect(bridgeMatch).not.toBeNull();

    // This should not throw — if it does, there's an unescaped quote or syntax error
    expect(() => {
      // eslint-disable-next-line no-new-func
      new Function(bridgeMatch![0]);
    }).not.toThrow();

    // Verify __au.done is defined (not broken by syntax errors above it)
    expect(pageBody).toContain("window.__au.done = function");
    expect(pageBody).toContain("window.__au.cancel = function");

    // The showRecovery function should use \\x27 not \' for nested quotes
    // Extract only the bridge IIFE (not the Babel script which legitimately uses getElementById('root'))
    const bridgeCode = bridgeMatch![0];
    expect(bridgeCode).not.toMatch(/getElementById\('[^']*'\)/);
  });

  // --- New live-mode features ---------------------------------------------

  it("injectBridge places dataBootstrap before first inline <script> in raw HTML", () => {
    const html = "<html><body><h1>x</h1><script>console.log(window.__au.data)</script></body></html>";
    const out = injectBridge(html, 1234, true, '{"foo":1}', "tok");
    const dataIdx = out.indexOf("window.__au.data = ");
    const userScriptIdx = out.indexOf("console.log(window.__au.data)");
    expect(dataIdx).toBeGreaterThan(0);
    expect(userScriptIdx).toBeGreaterThan(0);
    expect(dataIdx).toBeLessThan(userScriptIdx);
    expect(out).toContain("window.__au.subscribe");
  });

  it("injectBridge bridge IIFE goes at end of body, after user scripts", () => {
    const html = "<html><body><script>noop()</script></body></html>";
    const out = injectBridge(html, 1234, true, "{}", "tok");
    const userScriptIdx = out.indexOf("noop()");
    const bridgeIdx = out.indexOf("window.__au.done");
    expect(userScriptIdx).toBeGreaterThan(0);
    expect(bridgeIdx).toBeGreaterThan(userScriptIdx);
  });

  it("/api/open rejects paths outside --project-dir", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "au-pd-"));
    const htmlPath = join(tmpDir, "open.html");
    writeFileSync(htmlPath, "<html><body>open</body></html>");
    let openStatus = 0;
    let openBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open", "--project-dir", projectDir],
      async (port) => {
        const page = await getPage(port);
        const tokenMatch = page.body.match(/var sessionToken = '([^']+)'/);
        const token = tokenMatch![1];
        const escapingPath = "/etc/passwd";
        const data = JSON.stringify({ path: escapingPath });
        await new Promise<void>((resolveOuter, reject) => {
          const r = request(
            { hostname: "127.0.0.1", port, path: `/api/open?token=${encodeURIComponent(token)}`, method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-au-session-token": token } },
            (res) => {
              openStatus = res.statusCode ?? 0;
              let buf = "";
              res.on("data", (c: Buffer) => buf += c.toString());
              res.on("end", () => { openBody = buf; resolveOuter(); });
            }
          );
          r.on("error", reject);
          r.write(data); r.end();
        });
        postCallback(port, { action: "done", data: {} });
      }
    );
    expect(result.exitCode).toBe(0);
    expect(openStatus).toBe(403);
    expect(openBody).toContain("outside");
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("startServer resolves a result without exiting the host process", async () => {
    const sessionDir = join(tmpDir, "sdk-session");
    const opts: ServeOptions = {
      filePath: join(tmpDir, "sdk.html"),
      rootDir: tmpDir,
      dataJson: "{}",
      timeout: 0,
      noOpen: true,
      port: 0,
      multi: false,
      sessionDir,
      watch: [],
      transformPath: "",
      projectDir: tmpDir,
      reuseKey: "",
      printSummary: false,
      _rootWasExplicit: false,
    };

    const handle = await startServer("<html><body>SDK</body></html>", opts);
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`);
    expect(handle.sessionDir).toBe(sessionDir);

    await postCallback(handle.port, { action: "done", data: { source: "sdk" } });
    await expect(handle.result).resolves.toEqual({
      payload: { action: "done", data: { source: "sdk" } },
      exitCode: 0,
    });
    expect(existsSync(join(sessionDir, "feedback.json"))).toBe(true);
  });
});
