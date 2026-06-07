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

describe("agent-surface serve options remote", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-serve-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses an 8 hour default timeout", () => {
    expect(DEFAULT_SERVE_TIMEOUT_MS).toBe(28_800_000);
  });

  it("parses GitHub blob URLs for private gh api fetches", () => {
    expect(parseGithubBlobUrl("https://github.com/vltansky/agent-surface/blob/master/packages/web/src/pages/IndexPage.tsx")).toEqual({
      owner: "vltansky",
      repo: "agent-surface",
      segments: ["master", "packages", "web", "src", "pages", "IndexPage.tsx"],
    });
    expect(parseGithubBlobUrl("https://example.com/file.tsx")).toBeNull();
  });

  it("fetchRemoteSource uses gh api for GitHub blob URLs", async () => {
    const endpoints: string[] = [];
    const remote = await fetchRemoteSource(
      "https://github.com/vltansky/agent-surface/blob/master/packages/web/src/pages/IndexPage.tsx",
      {
        runGhApi: async (endpoint) => {
          endpoints.push(endpoint);
          return "function App() { return <div>Remote GitHub</div>; }";
        },
      }
    );

    expect(remote.fileName).toBe("IndexPage.tsx");
    expect(remote.content).toContain("Remote GitHub");
    expect(endpoints).toEqual([
      "/repos/vltansky/agent-surface/contents/packages/web/src/pages/IndexPage.tsx?ref=master",
    ]);
  });

  it("fetchRemoteSource retries GitHub blob refs with slashes", async () => {
    const endpoints: string[] = [];
    const remote = await fetchRemoteSource(
      "https://github.com/acme/app/blob/feature/nested/src/App.tsx",
      {
        runGhApi: async (endpoint) => {
          endpoints.push(endpoint);
          if (endpoint.includes("ref=feature%2Fnested")) {
            return "function App() { return <div>Nested branch</div>; }";
          }
          throw new Error("not found");
        },
      }
    );

    expect(remote.fileName).toBe("App.tsx");
    expect(endpoints).toEqual([
      "/repos/acme/app/contents/nested/src/App.tsx?ref=feature",
      "/repos/acme/app/contents/src/App.tsx?ref=feature%2Fnested",
    ]);
  });

  it("fetchRemoteSource uses the generic HTTP fetch path for non-GitHub URLs", async () => {
    const remote = await fetchRemoteSource("https://example.com/review.html", {
      fetchText: async (url) => `<html><body>${url}</body></html>`,
    });

    expect(remote.fileName).toBe("review.html");
    expect(remote.content).toContain("https://example.com/review.html");
  });

  it("serves a remote non-GitHub URL by fetching it first", async () => {
    const remoteServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<html><body><button onclick="window.__au.done({remote: true})">Remote</button></body></html>');
    });
    await new Promise<void>((resolve) => remoteServer.listen(0, "127.0.0.1", resolve));
    const address = remoteServer.address();
    expect(address).not.toBeNull();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      let pageBody = "";
      const result = await spawnServe(
        [`http://127.0.0.1:${port}/remote.html`, "--no-open"],
        async (servePort) => {
          const page = await getPage(servePort);
          pageBody = page.body;
          postCallback(servePort, { action: "done", data: { remote: true } });
        }
      );

      expect(result.exitCode).toBe(0);
      expect(pageBody).toContain("Remote");
      expect(pageBody).toContain("window.__au.done");
      expect(JSON.parse(result.stdout.trim())).toEqual({ action: "done", data: { remote: true } });
    } finally {
      await new Promise<void>((resolve) => remoteServer.close(() => resolve()));
    }
  });

  it("fails with exit code 1 for missing file", async () => {
    const result = await spawnServe(
      [join(tmpDir, "nonexistent.html"), "--no-open"],
      () => {}
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not found");
  });

  it("fails with exit code 1 for unsupported extension", async () => {
    const txtPath = join(tmpDir, "test.txt");
    writeFileSync(txtPath, "not html");

    const result = await spawnServe(
      [txtPath, "--no-open"],
      () => {}
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unsupported file type");
  });

  it("supports --data-file flag", async () => {
    const jsxPath = join(tmpDir, "test.jsx");
    writeFileSync(
      jsxPath,
      'function App() { return <div>{JSON.stringify(window.__au.data)}</div>; }'
    );
    const dataPath = join(tmpDir, "data.json");
    writeFileSync(dataPath, '{"fromFile": true}');

    let pageBody = "";
    const result = await spawnServe(
      [jsxPath, "--no-open", "--data-file", dataPath],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('"fromFile":true');
  });

  it("resolves bundled built-in templates without home-dir skill paths", async () => {
    let pageBody = "";
    const result = await spawnServe(
      ["--template", "form", "--no-open", "--data", '{"title":"Review","screens":[]}'],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: { approved: true } });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain("Review");
    expect(pageBody).toContain("window.__au.data");
  });

  it(" prints session directory to stderr", async () => {
    const htmlPath = join(tmpDir, "multi2.html");
    writeFileSync(htmlPath, "<html><body>Session test</body></html>");

    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        await new Promise(r => setTimeout(r, 300));
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Session:");
    expect(result.stderr).toContain("agent-surface-serve-");
  });
});
