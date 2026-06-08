import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import {
  AGENT_UI_FAVICON_SVG,
  MIME_TYPES,
  injectBridge,
} from "../browser-runtime";
import { openBrowser, runRefocusSequence } from "../platform";
import type { ServeOptions } from "./options";
import { startReloadWatcher, startWatchMode } from "./watch";

const SESSION_TOKEN_HEADER = "x-au-session-token";
export const EXIT_AFTER_DISCONNECT_MS = Number(process.env.AGENT_UI_EXIT_AFTER_DISCONNECT_MS) || 30_000;

export type ServeResult = {
  payload: Record<string, unknown>;
  exitCode: number;
};

export type ServeRouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  sessionToken: string;
  sessionDir: string;
  projectDir: string;
  rootDir: string;
  isAuthorized(): boolean;
  rejectUnauthorized(): void;
  readBody(): Promise<string>;
  broadcast(event: string, data?: string): void;
  finish(payload: Record<string, unknown>, exitCode?: number): void;
};

export type ServeRoute = (ctx: ServeRouteContext) => boolean | Promise<boolean>;

export type ServeUIExtensions = {
  extraRoutes?: ServeRoute[];
};

export type ServeServerHandle = {
  port: number;
  url: string;
  sessionDir: string;
  result: Promise<ServeResult>;
  close(payload?: Record<string, unknown>, exitCode?: number): void;
};

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
export function startServer(
  html: string,
  opts: ServeOptions,
  ext: ServeUIExtensions = {},
  rebuildEntry?: () => Promise<string>
): Promise<ServeServerHandle> {
  const extraRoutes = ext.extraRoutes ?? [];
  const liveMode = opts.watch.length > 0 || opts.reloadOnChange.length > 0;
  const sseClients: ServerResponse[] = [];
  const sessionToken = randomBytes(24).toString("hex");
  // Live data ref: replaced by the watcher on each transform run. Initial value = opts.dataJson.
  const currentData = { json: opts.dataJson };
  let disconnectTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let timeoutSubmitTimer: NodeJS.Timeout | null = null;
  let watcher: import("chokidar").FSWatcher | null = null;
  let reloadWatcher: import("chokidar").FSWatcher | null = null;
  let settled = false;
  let settleResult: (result: ServeResult) => void = () => undefined;
  const result = new Promise<ServeResult>((resolveResult) => {
    settleResult = resolveResult;
  });

  function clearTimers(): void {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (timeoutSubmitTimer) {
      clearTimeout(timeoutSubmitTimer);
      timeoutSubmitTimer = null;
    }
  }

  function closeSseClients(): void {
    for (const client of sseClients.splice(0)) {
      client.end();
    }
  }

  function sseBroadcast(event: string, data?: string): void {
    const msg = data ? `event: ${event}\ndata: ${data}\n\n` : `event: ${event}\ndata: {}\n\n`;
    for (const client of sseClients) {
      client.write(msg);
    }
  }
  function clearDisconnectTimer(): void {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  }
  function maybeStartDisconnectTimer(): void {
    // Only auto-exit-on-disconnect in live mode. Otherwise the existing --timeout
    // behavior (8h default) governs lifecycle.
    if (!liveMode) return;
    if (sseClients.length > 0) return;
    if (disconnectTimer) return;
    disconnectTimer = setTimeout(() => {
      finishServe({ action: "exit-on-disconnect" }, 0, { writeFeedback: false });
    }, EXIT_AFTER_DISCONNECT_MS);
  }

  mkdirSync(opts.sessionDir, { recursive: true });
  function getRequestUrl(req: IncomingMessage): URL {
    const addr = server.address() as { port?: number } | null;
    const port = addr?.port || opts.port || 0;
    return new URL(req.url || "/", `http://127.0.0.1:${port}`);
  }

  function isAuthorized(req: IncomingMessage): boolean {
    const url = getRequestUrl(req);
    const queryToken = url.searchParams.get("token");
    const headerToken = req.headers[SESSION_TOKEN_HEADER];
    const requestToken = Array.isArray(headerToken) ? headerToken[0] : headerToken || queryToken;
    return requestToken === sessionToken;
  }

  function rejectUnauthorized(res: ServerResponse): void {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
  }

  function finishServe(
    payload: Record<string, unknown>,
    exitCode: number,
    options: { writeFeedback?: boolean } = {}
  ): void {
    if (settled) return;
    settled = true;
    sseBroadcast("done");
    if (options.writeFeedback !== false) {
      writeFileSync(join(opts.sessionDir, "feedback.json"), JSON.stringify(payload, null, 2));
    }
    clearTimers();
    closeSseClients();
    void watcher?.close();
    void reloadWatcher?.close();
    server.close();
    settleResult({ payload, exitCode });
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestPath = getRequestUrl(req).pathname;

    if (req.method === "POST" && requestPath === "/callback") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

        if (payload.action === "cancel") {
          finishServe(payload, 1);
        } else {
          finishServe(payload, 0);
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
      return;
    }

    if (req.method === "GET" && requestPath === "/events") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write("event: connected\ndata: {}\n\n");
      sseClients.push(res);
      clearDisconnectTimer();
      req.on("close", () => {
        const idx = sseClients.indexOf(res);
        if (idx >= 0) sseClients.splice(idx, 1);
        maybeStartDisconnectTimer();
      });
      return;
    }

    // Persistent UI state, scoped by --reuse <key> when present (otherwise session-dir).
    // Survives server restarts and tab reloads — `~/.agent-surface/serve-state/<sha8>/state.json`.
    if (requestPath === "/api/state") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      const stateKey = opts.reuseKey || opts.sessionDir;
      const stateHash = createHash("sha256").update(stateKey).digest("hex").slice(0, 8);
      const stateDir = join(homedir(), ".agent-surface", "serve-state", stateHash);
      const statePath = join(stateDir, "state.json");
      if (req.method === "GET") {
        if (existsSync(statePath)) {
          try {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(readFileSync(statePath, "utf-8"));
          } catch {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end("{}");
          }
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        }
        return;
      }
      if (req.method === "POST") {
        try {
          const body = await readBody(req);
          JSON.parse(body); // validate
          mkdirSync(stateDir, { recursive: true });
          writeFileSync(statePath, body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
        }
        return;
      }
    }

    // Run-skill helper: switch focus to the user's previous app (their agent chat),
    // paste from clipboard, and press Enter to submit. Body: { send: true } for the full
    // sequence, { send: false } to only switch focus.
    if (req.method === "POST" && requestPath === "/api/refocus") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      let send = true;
      try {
        const body = await readBody(req);
        if (body) {
          const parsed = JSON.parse(body) as { send?: boolean };
          if (parsed.send === false) send = false;
        }
      } catch { /* default send=true */ }

      const result = await runRefocusSequence(send);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    // Open a path on the host with the platform's file manager. Path must live inside --project-dir.
    if (req.method === "POST" && requestPath === "/api/open") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { path?: unknown };
        const target = typeof parsed.path === "string" ? parsed.path : "";
        if (!target) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "missing path" }));
          return;
        }
        const resolved = resolve(target);
        const projectRoot = resolve(opts.projectDir);
        const rel = relative(projectRoot, resolved);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "path outside --project-dir" }));
          return;
        }
        openBrowser(resolved); // openBrowser uses platform-specific dispatch (open / start / xdg-open)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid request" }));
      }
      return;
    }

    // Persist/restore annotations across page reloads
    if (requestPath === "/api/annotations") {
      if (!isAuthorized(req)) {
        rejectUnauthorized(res);
        return;
      }
      const annPath = join(opts.sessionDir, "annotations.json");
      if (req.method === "GET") {
        if (existsSync(annPath)) {
          const data = readFileSync(annPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(data);
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("[]");
        }
        return;
      }
      if (req.method === "POST") {
        try {
          const body = await readBody(req);
          JSON.parse(body);
          writeFileSync(annPath, body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
        return;
      }
    }

    if (req.method === "GET" && (requestPath === "/" || requestPath === "/index.html")) {
      const port = (server.address() as { port: number }).port;
      let pageHtml = html;
      if (liveMode && rebuildEntry) {
        try {
          pageHtml = await rebuildEntry();
          html = pageHtml;
        } catch (err) {
          process.stderr.write(`Rebuild error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
      const injected = injectBridge(pageHtml, port, true, currentData.json, sessionToken, liveMode);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injected);
      return;
    }

    if (opts.mdxArtifact && req.method === "GET" && requestPath === "/source.mdx") {
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(opts.mdxArtifact.source);
      return;
    }

    if (opts.mdxArtifact && req.method === "GET" && requestPath === "/plain.md") {
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(opts.mdxArtifact.plain);
      return;
    }

    if (opts.mdxArtifact && req.method === "GET" && requestPath === "/metadata.json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(opts.mdxArtifact.metadata, null, 2));
      return;
    }

    if (req.method === "GET" && requestPath === "/favicon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
      res.end(AGENT_UI_FAVICON_SVG);
      return;
    }

    if (extraRoutes.length > 0) {
      const ctx: ServeRouteContext = {
        req,
        res,
        url: getRequestUrl(req),
        sessionToken,
        sessionDir: opts.sessionDir,
        projectDir: opts.projectDir,
        rootDir: opts.rootDir,
        isAuthorized: () => isAuthorized(req),
        rejectUnauthorized: () => rejectUnauthorized(res),
        readBody: () => readBody(req),
        broadcast: sseBroadcast,
        finish: (payload, exitCode = 0) => finishServe(payload, exitCode),
      };

      for (const route of extraRoutes) {
        if (await route(ctx)) return;
      }
    }

    let urlPath: string;
    try {
      urlPath = decodeURIComponent(req.url?.split("?")[0] || "");
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
      return;
    }
    const fileFsPath = resolve(opts.rootDir, "." + urlPath);

    const rel = relative(opts.rootDir, fileFsPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    if (existsSync(fileFsPath) && statSync(fileFsPath).isFile()) {
      const fileExt = extname(fileFsPath).toLowerCase();
      const contentType = MIME_TYPES[fileExt] || "application/octet-stream";
      const content = readFileSync(fileFsPath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  const handleReady = new Promise<ServeServerHandle>((resolveReady, rejectReady) => {
    const onError = (err: Error): void => {
      rejectReady(err);
    };
    server.once("error", onError);

    server.listen(opts.port, "127.0.0.1", () => {
      server.off("error", onError);
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}`;
      process.stderr.write(`Serving at ${url}\n`);
      writeFileSync(join(opts.sessionDir, "session.json"), JSON.stringify({ port: addr.port, url, pid: process.pid }));
      process.stderr.write(`Session: ${opts.sessionDir}\n`);
      if (!opts.noOpen) {
        openBrowser(url);
      }
      watcher = startWatchMode(
        { watch: opts.watch, transformPath: opts.transformPath, projectDir: opts.projectDir },
        {
          broadcast: sseBroadcast,
          setCurrentData(json: string): void {
            currentData.json = json;
          },
        }
      );
      reloadWatcher = startReloadWatcher(
        { reloadOnChange: opts.reloadOnChange, watchIgnore: opts.watchIgnore },
        { broadcast: sseBroadcast }
      );

      resolveReady({
        port: addr.port,
        url,
        sessionDir: opts.sessionDir,
        result,
        close(payload = { action: "cancel" }, exitCode = 1): void {
          finishServe(payload, exitCode);
        },
      });
    });
  });

  if (opts.timeout > 0) {
    timeoutTimer = setTimeout(() => {
      // Ask the browser to auto-submit current state instead of just timing out
      sseBroadcast("auto-submit");
      // Give the browser 3 seconds to submit, then force exit
      timeoutSubmitTimer = setTimeout(() => {
        finishServe({ action: "timeout" }, 2, { writeFeedback: false });
      }, 3000);
    }, opts.timeout);
  }

  return handleReady;
}
