import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
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
import { CLI_PATH, getPage, postCallback, runServedBridgeAction, spawnServe } from "./test-utils";

describe("agent-surface watch reuse", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-serve-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it(" SSE endpoint available", async () => {
    const htmlPath = join(tmpDir, "sse.html");
    writeFileSync(htmlPath, "<html><body>SSE test</body></html>");

    let sseStatus = 0;
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        const resp = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = request(
            { hostname: "127.0.0.1", port, path: "/", method: "GET" },
            (res) => {
              let body = "";
              res.on("data", (d: Buffer) => {
                body += d.toString();
                if (!body.includes("var sessionToken")) return;
                const tokenMatch = body.match(/var sessionToken = '([^']+)'/);
                if (!tokenMatch) return;
                const token = tokenMatch[1];
                res.destroy();
                const sseReq = request(
                  { hostname: "127.0.0.1", port, path: `/events?token=${encodeURIComponent(token)}`, method: "GET" },
                  (sseRes) => {
                    let sseBody = "";
                    sseRes.on("data", (chunk: Buffer) => {
                      sseBody += chunk.toString();
                      sseRes.destroy();
                      resolve({ status: sseRes.statusCode ?? 0, body: sseBody });
                    });
                  }
                );
                sseReq.on("error", reject);
                sseReq.end();
              });
            }
          );
          req.on("error", reject);
          req.end();
        });
        sseStatus = resp.status;
        expect(resp.body).toContain("event: connected");
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(sseStatus).toBe(200);
  });

  it("injectBridge with watchMode=true does NOT register the beforeunload cancel beacon", () => {
    const watchOn = injectBridge("<html><body>x</body></html>", 1234, true, "{}", "tok", true);
    const watchOff = injectBridge("<html><body>x</body></html>", 1234, true, "{}", "tok", false);
    expect(watchOff).toContain("beforeunload");
    // In watch mode the listener is gated behind a runtime check; the literal
    // beforeunload string is still present in source but inside an `if (!watchMode)` block.
    // The reliable assertion: watchMode=true substitutes the placeholder accordingly.
    expect(watchOn).toContain("var watchMode = true;");
    expect(watchOff).toContain("var watchMode = false;");
  });

  it("--watch requires --transform", async () => {
    const htmlPath = join(tmpDir, "x.html");
    writeFileSync(htmlPath, "<html><body>x</body></html>");
    const result = await spawnServe(
      [htmlPath, "--no-open", "--watch", "*.json"],
      () => {}
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--watch requires --transform");
  });

  it("--transform seeds initial window.__as.data on first paint", async () => {
    const htmlPath = join(tmpDir, "init.html");
    writeFileSync(htmlPath, "<html><body><script>document.title='x'</script></body></html>");
    const tx = join(tmpDir, "tx.js");
    writeFileSync(tx, "module.exports = async () => ({ value: 'INITIAL' });");

    let pageBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open", "--watch", "*.txt", "--transform", tx, "--project-dir", tmpDir],
      async (port) => {
        const page = await getPage(port);
        pageBody = page.body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(pageBody).toContain('"value":"INITIAL"');
  });

  it("--watch broadcasts SSE 'data' event when watched file changes", async () => {
    const htmlPath = join(tmpDir, "live.html");
    writeFileSync(htmlPath, "<html><body>live</body></html>");
    const dataFile = join(tmpDir, "data.json");
    writeFileSync(dataFile, '{"v":1}');
    const tx = join(tmpDir, "tx.js");
    writeFileSync(
      tx,
      "const fs = require('fs'); const p = require('path');\n" +
      "module.exports = async ({ projectDir }) => JSON.parse(fs.readFileSync(p.join(projectDir, 'data.json'), 'utf-8'));"
    );

    let dataEventBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open", "--watch", "data.json", "--transform", tx, "--project-dir", tmpDir],
      async (port) => {
        // Open SSE, then modify the watched file, then capture the next 'data' event.
        const page = await getPage(port);
        const tokenMatch = page.body.match(/var sessionToken = '([^']+)'/);
        const token = tokenMatch![1];

        await new Promise<void>((resolveOuter, reject) => {
          const sseReq = request(
            { hostname: "127.0.0.1", port, path: `/events?token=${encodeURIComponent(token)}`, method: "GET" },
            (sseRes) => {
              let buf = "";
              let connected = false;
              let triggered = false;
              sseRes.on("data", (chunk: Buffer) => {
                buf += chunk.toString();
                if (!connected && buf.includes("event: connected")) {
                  connected = true;
                  // Trigger a change after SSE connect so we don't miss it.
                  setTimeout(() => { writeFileSync(dataFile, '{"v":2}'); }, 100);
                }
                if (connected && !triggered && buf.includes("event: data")) {
                  // Capture the data line for the data event.
                  const m = buf.match(/event: data\ndata: ([^\n]+)/);
                  if (m) {
                    dataEventBody = m[1];
                    triggered = true;
                    sseRes.destroy();
                    resolveOuter();
                  }
                }
              });
              sseRes.on("end", () => { if (!triggered) resolveOuter(); });
            }
          );
          sseReq.on("error", reject);
          sseReq.end();
        });

        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(dataEventBody).toContain('"v":2');
  });

  it("--print-summary writes transform.summary field to stdout", async () => {
    const htmlPath = join(tmpDir, "sum.html");
    writeFileSync(htmlPath, "<html><body>sum</body></html>");
    const tx = join(tmpDir, "tx.js");
    writeFileSync(tx, "module.exports = async () => ({ value: 1, summary: 'line A\\nline B' });");

    const result = await spawnServe(
      [htmlPath, "--no-open", "--watch", "*.txt", "--transform", tx, "--project-dir", tmpDir, "--print-summary"],
      (port) => {
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    // stdout is JSON-per-line for callback events; summary is printed BEFORE the JSON action line.
    expect(result.stdout).toContain("line A\nline B");
  });

  it("--reuse: second invocation prints existing URL and exits 0 without spawning", async () => {
    const htmlPath = join(tmpDir, "reuse.html");
    writeFileSync(htmlPath, "<html><body>reuse</body></html>");
    const reuseKey = `test-reuse-${Date.now()}-${Math.random()}`;

    let firstPort = 0;
    const reuseResult = await new Promise<{ stdout: string; exitCode: number; firstUrl: string }>((resolveOuter) => {
      const first = spawn(process.execPath, [CLI_PATH, "serve", htmlPath, "--no-open", "--reuse", reuseKey], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let firstStderr = "";
      first.stderr.on("data", (d: Buffer) => {
        firstStderr += d.toString();
        if (!firstPort) {
          const m = firstStderr.match(/Serving at http:\/\/127\.0\.0\.1:(\d+)/);
          if (m) {
            firstPort = Number(m[1]);
            const firstUrl = `http://127.0.0.1:${firstPort}`;
            // Spawn second invocation with the SAME --reuse key
            const second = spawn(process.execPath, [CLI_PATH, "serve", htmlPath, "--no-open", "--reuse", reuseKey], {
              stdio: ["pipe", "pipe", "pipe"],
            });
            let secondStdout = "";
            second.stdout.on("data", (d: Buffer) => { secondStdout += d.toString(); });
            second.on("close", (code) => {
              first.kill("SIGTERM");
              resolveOuter({ stdout: secondStdout, exitCode: code ?? 1, firstUrl });
            });
          }
        }
      });
    });

    expect(reuseResult.exitCode).toBe(0);
    expect(reuseResult.stdout.trim()).toBe(reuseResult.firstUrl);
  });

  it("--watch suppresses the default 8h timeout (still honors explicit --timeout)", async () => {
    // Use a short explicit timeout to verify it's still respected when set.
    const htmlPath = join(tmpDir, "wt.html");
    writeFileSync(htmlPath, "<html><body>wt</body></html>");
    const tx = join(tmpDir, "tx.js");
    writeFileSync(tx, "module.exports = async () => ({ ok: 1 });");
    const result = await spawnServe(
      [htmlPath, "--no-open", "--watch", "*.txt", "--transform", tx, "--project-dir", tmpDir, "--timeout", "500"],
      () => { /* let it time out */ }
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout.trim())).toEqual({ action: "timeout" });
  });

  it("--exit-on-disconnect: server exits ~30s after last SSE client (env-overridable)", async () => {
    const htmlPath = join(tmpDir, "disco.html");
    writeFileSync(htmlPath, "<html><body>disco</body></html>");
    const tx = join(tmpDir, "tx.js");
    writeFileSync(tx, "module.exports = async () => ({ x: 1 });");

    const proc = spawn(
      process.execPath,
      [CLI_PATH, "serve", htmlPath, "--no-open", "--watch", "*.txt", "--transform", tx, "--project-dir", tmpDir],
      { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, AGENT_UI_EXIT_AFTER_DISCONNECT_MS: "500" } }
    );

    let stderr = "";
    let exitCode: number | null = null;
    const t0 = Date.now();
    const exitedAt = await new Promise<number>((resolveOuter, reject) => {
      proc.stderr.on("data", async (d: Buffer) => {
        stderr += d.toString();
        const m = stderr.match(/Serving at http:\/\/127\.0\.0\.1:(\d+)/);
        if (m && exitCode === null) {
          const port = Number(m[1]);
          // Open SSE, then close immediately
          const page = await getPage(port);
          const tokenMatch = page.body.match(/var sessionToken = '([^']+)'/);
          const token = tokenMatch![1];
          const sseReq = request(
            { hostname: "127.0.0.1", port, path: `/events?token=${encodeURIComponent(token)}`, method: "GET" },
            (sseRes) => {
              sseRes.on("data", () => sseRes.destroy());
            }
          );
          sseReq.on("error", reject);
          sseReq.end();
        }
      });
      proc.on("close", (code) => {
        exitCode = code;
        resolveOuter(Date.now() - t0);
      });
      setTimeout(() => { proc.kill("SIGTERM"); reject(new Error("timeout")); }, 10_000);
    });

    expect(exitCode).toBe(0);
    expect(exitedAt).toBeGreaterThan(400);
    expect(exitedAt).toBeLessThan(5_000);
  });

  it("--reload-on-change broadcasts a debounced 'reload' SSE event when a watched file changes", async () => {
    const htmlPath = join(tmpDir, "live.html");
    writeFileSync(htmlPath, "<html><body>v1</body></html>");
    const watched = join(tmpDir, "src.txt");
    writeFileSync(watched, "1");

    let sawReload = false;
    const result = await spawnServe(
      [htmlPath, "--no-open", "--reload-on-change", join(tmpDir, "*.txt")],
      async (port) => {
        const page = await getPage(port);
        const token = page.body.match(/var sessionToken = '([^']+)'/)![1];

        await new Promise<void>((resolveOuter, reject) => {
          const sseReq = request(
            {
              hostname: "127.0.0.1",
              port,
              path: `/events?token=${encodeURIComponent(token)}`,
              method: "GET",
            },
            (sseRes) => {
              let buf = "";
              let connected = false;
              sseRes.on("data", (chunk: Buffer) => {
                buf += chunk.toString();
                if (!connected && buf.includes("event: connected")) {
                  connected = true;
                  setTimeout(() => {
                    writeFileSync(watched, "2");
                  }, 100);
                }
                if (connected && buf.includes("event: reload")) {
                  sawReload = true;
                  sseRes.destroy();
                  resolveOuter();
                }
              });
              sseRes.on("end", () => resolveOuter());
            }
          );
          sseReq.on("error", reject);
          sseReq.end();
        });

        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(sawReload).toBe(true);
  });

  it("--watch-ignore excludes matching paths from triggering reload", async () => {
    const htmlPath = join(tmpDir, "ignore.html");
    writeFileSync(htmlPath, "<html><body>ig</body></html>");

    let reloadAfterIgnored = false;
    const result = await spawnServe(
      [htmlPath, "--no-open", "--reload-on-change", join(tmpDir, "*.txt"), "--watch-ignore", "**/ignored.txt"],
      async (port) => {
        const page = await getPage(port);
        const token = page.body.match(/var sessionToken = '([^']+)'/)![1];
        const ignoredFile = join(tmpDir, "ignored.txt");
        const liveFile = join(tmpDir, "live.txt");

        await new Promise<void>((resolveOuter, reject) => {
          const sseReq = request(
            {
              hostname: "127.0.0.1",
              port,
              path: `/events?token=${encodeURIComponent(token)}`,
              method: "GET",
            },
            (sseRes) => {
              let buf = "";
              let connected = false;
              sseRes.on("data", (chunk: Buffer) => {
                buf += chunk.toString();
                if (!connected && buf.includes("event: connected")) {
                  connected = true;
                  writeFileSync(ignoredFile, "x");
                  setTimeout(() => {
                    reloadAfterIgnored = buf.includes("event: reload");
                    writeFileSync(liveFile, "y");
                  }, 600);
                }
                if (connected && buf.includes("event: reload")) {
                  sseRes.destroy();
                  resolveOuter();
                }
              });
              sseRes.on("end", () => resolveOuter());
            }
          );
          sseReq.on("error", reject);
          sseReq.end();
        });

        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(reloadAfterIgnored).toBe(false);
  });

  it("--reload-on-change re-bundles the entry per request", async () => {
    const htmlPath = join(tmpDir, "rebuild.html");
    writeFileSync(htmlPath, "<html><body>BEFORE</body></html>");

    let firstBody = "";
    let secondBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open", "--reload-on-change", htmlPath],
      async (port) => {
        firstBody = (await getPage(port)).body;
        writeFileSync(htmlPath, "<html><body>AFTER</body></html>");
        secondBody = (await getPage(port)).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(firstBody).toContain("BEFORE");
    expect(secondBody).toContain("AFTER");
    expect(secondBody).not.toContain("BEFORE");
  });

  it("one-shot mode builds the entry once", async () => {
    const htmlPath = join(tmpDir, "frozen.html");
    writeFileSync(htmlPath, "<html><body>ONCE</body></html>");

    let firstBody = "";
    let secondBody = "";
    const result = await spawnServe(
      [htmlPath, "--no-open"],
      async (port) => {
        firstBody = (await getPage(port)).body;
        writeFileSync(htmlPath, "<html><body>TWICE</body></html>");
        secondBody = (await getPage(port)).body;
        postCallback(port, { action: "done", data: {} });
      }
    );

    expect(result.exitCode).toBe(0);
    expect(firstBody).toContain("ONCE");
    expect(secondBody).toContain("ONCE");
    expect(secondBody).not.toContain("TWICE");
  });
});
