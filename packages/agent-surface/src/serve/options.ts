import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MdxArtifact } from "../mdx";
import { isRemoteUrl } from "./remote-source";
import { resolveSessionDir } from "./session";

export interface ServeOptions {
  filePath: string;
  rootDir: string;
  dataJson: string;
  timeout: number;
  noOpen: boolean;
  port: number;
  multi: boolean;
  sessionDir: string;
  watch: string[];
  transformPath: string;
  projectDir: string;
  reuseKey: string;
  printSummary: boolean;
  mdxArtifact?: MdxArtifact;
  _rootWasExplicit: boolean;
}

export const DEFAULT_SERVE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export function parseServeArgs(args: string[]): ServeOptions {
  let filePath = "";
  let rootDir = "";
  let dataJson = "{}";
  let timeout = DEFAULT_SERVE_TIMEOUT_MS;
  let timeoutExplicit = false;
  let noOpen = false;
  let port = 0;
  let sessionDirOverride = "";
  const watch: string[] = [];
  let transformPath = "";
  let projectDir = "";
  let reuseKey = "";
  let printSummary = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) {
      rootDir = resolve(args[++i]);
    } else if (arg === "--watch" && i + 1 < args.length) {
      watch.push(args[++i]);
    } else if (arg === "--transform" && i + 1 < args.length) {
      transformPath = resolve(args[++i]);
    } else if (arg === "--project-dir" && i + 1 < args.length) {
      projectDir = resolve(args[++i]);
    } else if (arg === "--reuse" && i + 1 < args.length) {
      reuseKey = args[++i];
    } else if (arg === "--print-summary") {
      printSummary = true;
    } else if (arg === "--data" && i + 1 < args.length) {
      dataJson = args[++i];
    } else if (arg === "--data-file" && i + 1 < args.length) {
      const dataFilePath = resolve(args[++i]);
      if (!existsSync(dataFilePath)) {
        throw new Error(`Data file not found: ${dataFilePath}`);
      }
      dataJson = readFileSync(dataFilePath, "utf-8");
    } else if (arg === "--timeout" && i + 1 < args.length) {
      timeout = Number(args[++i]);
      timeoutExplicit = true;
      if (Number.isNaN(timeout) || timeout < 0) {
        throw new Error("--timeout must be a non-negative number (milliseconds; 0 disables)");
      }
    } else if (arg === "--no-open") {
      noOpen = true;
    } else if (arg === "--template" && i + 1 < args.length) {
      const tplName = args[++i];
      const tplDirs = [
        join(__dirname, "..", "templates"),
      ];
      let found = false;
      for (const dir of tplDirs) {
        for (const ext of [".jsx", ".tsx", ".html"]) {
          const candidate = join(dir, tplName + ext);
          if (existsSync(candidate)) {
            filePath = candidate;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        throw new Error(`Template "${tplName}" not found. Available: picker, form`);
      }
    } else if (arg === "--port" && i + 1 < args.length) {
      port = Number(args[++i]);
      if (Number.isNaN(port) || port < 0) {
        throw new Error("--port must be a non-negative number");
      }
    } else if (arg === "--session-dir" && i + 1 < args.length) {
      sessionDirOverride = resolve(args[++i]);
    } else if (!arg.startsWith("--") && !filePath) {
      filePath = arg;
    }
  }

  if (!filePath) {
    throw new Error(
      "Usage: agent-surface serve <file.html|file.jsx|file.tsx|file.mdx|url> [--data <json>] [--data-file <path>] [--timeout <ms>] [--no-open] [--port <n>] [--session-dir <path>] [--watch <glob>] [--transform <script>] [--project-dir <dir>] [--reuse <key>] [--print-summary]"
    );
  }

  if (watch.length > 0 && !transformPath) {
    throw new Error("--watch requires --transform");
  }

  // Canonicalize so downstream shell capture gets compact JSON
  try {
    dataJson = JSON.stringify(JSON.parse(dataJson));
  } catch {
    throw new Error("--data must be valid JSON");
  }

  const rootWasExplicit = !!rootDir;
  const resolvedFile = isRemoteUrl(filePath) ? filePath : resolve(filePath);
  if (!rootDir) {
    rootDir = isRemoteUrl(filePath) ? process.cwd() : resolve(resolvedFile, "..");
  }

  if (!projectDir) projectDir = process.cwd();

  const sessionDir = resolveSessionDir(sessionDirOverride, reuseKey);

  // Watch mode is intended to run as long as a browser is connected. The 8h default
  // timeout is appropriate for one-shot pickers/forms; in watch mode the right lifecycle
  // is the SSE-disconnect grace (default 30s after the last tab closes).
  if (watch.length > 0 && !timeoutExplicit) {
    timeout = 0;
  }

  return {
    filePath: resolvedFile, rootDir, dataJson, timeout, noOpen, port, multi: false,
    sessionDir, watch, transformPath, projectDir, reuseKey, printSummary,
    _rootWasExplicit: rootWasExplicit,
  };
}
