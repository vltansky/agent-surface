import { spawn } from "node:child_process";
import { join } from "node:path";
import { request } from "node:http";
import { expect } from "vitest";

export const CLI_PATH = join(import.meta.dirname, "..", "dist", "cli.js");

export type ServeResult = { stdout: string; stderr: string; exitCode: number };

export function spawnServe(
  args: string[],
  onReady: (port: number) => void
): Promise<ServeResult> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [CLI_PATH, "serve", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let readyCalled = false;

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (!readyCalled) {
        const match = stderr.match(/Serving at http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          readyCalled = true;
          onReady(Number(match[1]));
        }
      }
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    setTimeout(() => {
      proc.kill("SIGTERM");
    }, 15_000);
  });
}

export function postCallback(
  port: number,
  body: Record<string, unknown>
): Promise<number> {
  return getPage(port).then((page) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const match = page.body.match(/var sessionToken = '([^']+)'/);
    const sessionToken = match?.[1];
    if (!sessionToken) {
      reject(new Error("Session token not found in served page"));
      return;
    }
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/callback?token=" + encodeURIComponent(sessionToken),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "x-au-session-token": sessionToken,
        },
      },
      (res) => resolve(res.statusCode ?? 0)
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  }));
}

export function getPage(port: number, path = "/"): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d.toString()));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""])
            ),
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

export function runServedBridgeAction(
  pageBody: string,
  action: (windowObject: { __au?: { done(data?: unknown): void; cancel(): void; regenerate(data?: unknown): void }; [key: string]: unknown }) => void
): Promise<void> {
  const bridgeMatch = pageBody.match(/<script>\s*(\(function\(\)\s*\{[\s\S]*?var baseUrl[\s\S]*?\}\)\(\);)\s*<\/script>/);
  expect(bridgeMatch).not.toBeNull();

  return new Promise((resolve, reject) => {
    const windowObject = {
      addEventListener: () => undefined,
    } as { __au?: { done(data?: unknown): void; cancel(): void; regenerate(data?: unknown): void }; [key: string]: unknown; addEventListener(): void };
    const documentObject = { body: { innerHTML: "" } };
    const navigatorObject = { sendBeacon: () => true };
    const urlObject = { createObjectURL: () => "blob:agent-surface-test" };
    const blobConstructor = function Blob() {};
    const eventSourceConstructor = function EventSource() {
      return {
        addEventListener: () => undefined,
        close: () => undefined,
      };
    };

    class BridgeXMLHttpRequest {
      status = 0;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      private method = "GET";
      private url = "";
      private headers: Record<string, string> = {};

      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
      }

      send(body: string): void {
        const target = new URL(this.url);
        const req = request(
          {
            hostname: target.hostname,
            port: Number(target.port),
            path: target.pathname + target.search,
            method: this.method,
            headers: {
              ...this.headers,
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            this.status = res.statusCode ?? 0;
            res.resume();
            res.on("end", () => {
              this.onload?.();
              resolve();
            });
          }
        );
        req.on("error", (error) => {
          this.onerror?.();
          reject(error);
        });
        req.write(body);
        req.end();
      }
    }

    try {
      new Function("window", "document", "navigator", "XMLHttpRequest", "Blob", "URL", "EventSource", bridgeMatch![1])(
        windowObject,
        documentObject,
        navigatorObject,
        BridgeXMLHttpRequest,
        blobConstructor,
        urlObject,
        eventSourceConstructor
      );
      expect(windowObject["__" + "ck"]).toBeUndefined();
      expect(windowObject.__au).toBeDefined();
      action(windowObject);
    } catch (error) {
      reject(error);
    }
  });
}
