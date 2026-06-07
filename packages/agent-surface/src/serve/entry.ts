import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { buildJsxShell } from "../browser-runtime";
import { buildJsxBundle } from "../jsx-bundler";
import { buildMdxArtifact } from "../mdx";
import { parseServeArgs, type ServeOptions } from "./options";
import { fetchRemoteSource, isRemoteUrl } from "./remote-source";
import { tryReuseExisting } from "./session";
import { loadTransform } from "./watch";
import { startServer } from "./server";

function resolveEntryPoint(opts: ServeOptions, rootWasExplicit: boolean): void {
  if (!existsSync(opts.filePath)) {
    console.error(`Error: Not found: ${opts.filePath}`);
    process.exit(1);
  }
  if (statSync(opts.filePath).isDirectory()) {
    const dir = opts.filePath;
    for (const name of ["index.jsx", "index.tsx", "index.mdx", "index.html", "index.htm"]) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        opts.filePath = candidate;
        if (!rootWasExplicit) {
          opts.rootDir = dir;
        }
        return;
      }
    }
    console.error(`Error: No index.html, index.jsx, or index.mdx found in ${dir}`);
    process.exit(1);
  }
}

async function materializeRemoteEntry(opts: ServeOptions): Promise<void> {
  if (!isRemoteUrl(opts.filePath)) return;

  let remote;
  try {
    remote = await fetchRemoteSource(opts.filePath);
  } catch (err) {
    throw new Error(`Failed to fetch remote source: ${err instanceof Error ? err.message : String(err)}`);
  }

  const remoteDir = join(opts.sessionDir, "remote-source");
  mkdirSync(remoteDir, { recursive: true });
  const localPath = join(remoteDir, remote.fileName);
  writeFileSync(localPath, remote.content);
  opts.filePath = localPath;
  if (!opts._rootWasExplicit) {
    opts.rootDir = remoteDir;
  }
}

export async function serveUI(commandArgs: string[]): Promise<void> {
  const opts = parseServeArgs(commandArgs);

  if (opts.reuseKey) {
    mkdirSync(opts.sessionDir, { recursive: true });
    if (tryReuseExisting(opts)) {
      process.exit(0);
    }
  }

  try {
    await materializeRemoteEntry(opts);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  resolveEntryPoint(opts, opts._rootWasExplicit);

  if (!existsSync(opts.filePath)) {
    console.error(`Error: File not found: ${opts.filePath}`);
    process.exit(1);
  }

  if (opts.transformPath) {
    try {
      const transform = loadTransform(opts.transformPath);
      const initial = await transform({ projectDir: opts.projectDir, changedPaths: [], isInitial: true });
      opts.dataJson = JSON.stringify(initial ?? {});
      if (opts.printSummary) {
        const summary = (initial && typeof (initial as { summary?: unknown }).summary === "string")
          ? (initial as { summary: string }).summary
          : "";
        if (summary) {
          process.stdout.write(summary.endsWith("\n") ? summary : summary + "\n");
          mkdirSync(opts.sessionDir, { recursive: true });
          writeFileSync(join(opts.sessionDir, "summary.txt"), summary.endsWith("\n") ? summary : summary + "\n");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Transform failed on initial run: ${msg}`);
      process.exit(1);
    }
  }

  const ext = extname(opts.filePath).toLowerCase();
  const rawContent = readFileSync(opts.filePath, "utf-8");

  let html: string;
  if (ext === ".jsx" || ext === ".tsx") {
    try {
      const bundledSource = await buildJsxBundle({
        entryPath: opts.filePath,
        rootDir: opts.rootDir,
      });
      html = buildJsxShell(bundledSource, opts.dataJson);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else if (ext === ".mdx") {
    try {
      const artifact = buildMdxArtifact(rawContent, opts.filePath);
      html = artifact.html;
      opts.mdxArtifact = artifact;
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else if (ext === ".html" || ext === ".htm") {
    html = rawContent;
  } else {
    console.error(`Error: Unsupported file type "${ext}". Use .html, .jsx, .tsx, .mdx, or a URL ending in one of those extensions`);
    process.exit(1);
  }

  const handle = await startServer(html, opts);
  const shutdown = (): void => {
    handle.close({ action: "cancel" }, 1);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const result = await handle.result;
  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);
  process.stdout.write(JSON.stringify(result.payload) + "\n");
  process.exit(result.exitCode);
}
