import { request } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startServer,
  type ServeOptions,
  type ServeRoute,
  type ServeUIExtensions,
} from "../src/serve";
import { getPage } from "./test-utils";

function makeOpts(tmpDir: string, overrides: Partial<ServeOptions> = {}): ServeOptions {
  const htmlPath = join(tmpDir, "ext.html");
  writeFileSync(htmlPath, "<html><body>ext</body></html>");
  return {
    filePath: htmlPath,
    rootDir: tmpDir,
    dataJson: "{}",
    timeout: 0,
    noOpen: true,
    port: 0,
    multi: false,
    sessionDir: join(tmpDir, "session"),
    watch: [],
    reloadOnChange: [],
    watchIgnore: [],
    transformPath: "",
    projectDir: tmpDir,
    reuseKey: "",
    printSummary: false,
    _rootWasExplicit: false,
    ...overrides,
  };
}

function getToken(port: number): Promise<string> {
  return getPage(port).then((page) => {
    const match = page.body.match(/var sessionToken = '([^']+)'/);
    if (!match) throw new Error("token not found");
    return match[1];
  });
}

function rawPost(
  port: number,
  path: string,
  body: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "Content-Length": Buffer.byteLength(body), ...headers },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: buf }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("serve extensions: extraRoutes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-surface-ext-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("a route returning true short-circuits; built-ins still win over extra routes", async () => {
    const catchAll: ServeRoute = (ctx) => {
      ctx.res.writeHead(200, { "Content-Type": "text/plain" });
      ctx.res.end("ROUTE");
      return true;
    };
    const extensions: ServeUIExtensions = { extraRoutes: [catchAll] };
    const handle = await startServer("<html><body>x</body></html>", makeOpts(tmpDir), extensions);

    const custom = await getPage(handle.port, "/api/custom");
    expect(custom.body).toBe("ROUTE");

    const token = await getToken(handle.port);
    const events = await new Promise<string>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: handle.port,
          path: `/events?token=${encodeURIComponent(token)}`,
          method: "GET",
        },
        (res) => {
          let buf = "";
          res.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            res.destroy();
            resolve(buf);
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(events).toContain("event: connected");
    expect(events).not.toContain("ROUTE");

    handle.close();
    await handle.result;
  });

  it("a route returning false falls through to static-file serving / 404", async () => {
    let called = false;
    const passthrough: ServeRoute = () => {
      called = true;
      return false;
    };
    const handle = await startServer(
      "<html><body>x</body></html>",
      makeOpts(tmpDir),
      { extraRoutes: [passthrough] }
    );

    const resp = await getPage(handle.port, "/nope");
    expect(called).toBe(true);
    expect(resp.status).toBe(404);

    handle.close();
    await handle.result;
  });

  it("ctx.isAuthorized() reflects token; ctx.rejectUnauthorized() writes 403", async () => {
    const guarded: ServeRoute = (ctx) => {
      if (ctx.url.pathname !== "/api/guarded") return false;
      if (!ctx.isAuthorized()) {
        ctx.rejectUnauthorized();
        return true;
      }
      ctx.res.writeHead(200, { "Content-Type": "application/json" });
      ctx.res.end(JSON.stringify({ ok: true }));
      return true;
    };
    const handle = await startServer(
      "<html><body>x</body></html>",
      makeOpts(tmpDir),
      { extraRoutes: [guarded] }
    );

    const unauth = await getPage(handle.port, "/api/guarded");
    expect(unauth.status).toBe(403);
    expect(unauth.body).toContain("Forbidden");

    const token = await getToken(handle.port);
    const auth = await getPage(handle.port, `/api/guarded?token=${encodeURIComponent(token)}`);
    expect(auth.status).toBe(200);
    expect(auth.body).toContain('"ok":true');

    handle.close();
    await handle.result;
  });

  it("ctx.readBody() returns the POST body", async () => {
    const echo: ServeRoute = async (ctx) => {
      if (ctx.url.pathname !== "/api/echo") return false;
      const body = await ctx.readBody();
      ctx.res.writeHead(200, { "Content-Type": "application/json" });
      ctx.res.end(body);
      return true;
    };
    const handle = await startServer(
      "<html><body>x</body></html>",
      makeOpts(tmpDir),
      { extraRoutes: [echo] }
    );

    const resp = await rawPost(handle.port, "/api/echo", '{"hello":"world"}', {
      "Content-Type": "application/json",
    });
    expect(resp.status).toBe(200);
    expect(JSON.parse(resp.body)).toEqual({ hello: "world" });

    handle.close();
    await handle.result;
  });

  it("ctx.finish(payload, code) settles the result promise with payload and exit code", async () => {
    const finisher: ServeRoute = (ctx) => {
      if (ctx.url.pathname !== "/api/finish") return false;
      ctx.res.writeHead(200, { "Content-Type": "application/json" });
      ctx.res.end(JSON.stringify({ ok: true }));
      ctx.finish({ action: "custom-done", data: { source: "route" } }, 0);
      return true;
    };
    const handle = await startServer(
      "<html><body>x</body></html>",
      makeOpts(tmpDir),
      { extraRoutes: [finisher] }
    );

    await getPage(handle.port, "/api/finish");
    await expect(handle.result).resolves.toEqual({
      payload: { action: "custom-done", data: { source: "route" } },
      exitCode: 0,
    });
  });
});
