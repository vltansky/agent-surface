import { existsSync } from "node:fs";
import chokidar from "chokidar";

export const WATCH_DEBOUNCE_MS = 250;

export type TransformFn = (ctx: { projectDir: string; changedPaths: string[]; isInitial: boolean }) => unknown | Promise<unknown>;

export function loadTransform(transformPath: string): TransformFn {
  if (!existsSync(transformPath)) {
    throw new Error(`Transform not found: ${transformPath}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(transformPath);
  const fn = (typeof mod === "function" ? mod : mod && mod.default) as TransformFn | undefined;
  if (typeof fn !== "function") {
    throw new Error(`Transform at ${transformPath} must export a function (CommonJS module.exports = fn or default export)`);
  }
  return fn;
}

export type WatchRuntime = {
  broadcast(event: string, data?: string): void;
  setCurrentData(json: string): void;
};

export function startWatchMode(opts: { watch: string[]; transformPath: string; projectDir: string }, runtime: WatchRuntime): chokidar.FSWatcher | null {
  if (opts.watch.length === 0 || !opts.transformPath) return null;

  const transform = loadTransform(opts.transformPath);
  let pending: Set<string> | null = null;
  let inFlight = false;
  let debounce: NodeJS.Timeout | null = null;

  async function runTransform(changedPaths: string[]): Promise<void> {
    if (inFlight) {
      if (!pending) pending = new Set();
      for (const p of changedPaths) pending.add(p);
      return;
    }
    inFlight = true;
    try {
      const result = await transform({ projectDir: opts.projectDir, changedPaths, isInitial: false });
      const json = JSON.stringify(result ?? {});
      runtime.setCurrentData(json);
      runtime.broadcast("data", json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Transform error: ${msg}\n`);
      runtime.broadcast("error", JSON.stringify({ message: msg }));
    } finally {
      inFlight = false;
      if (pending && pending.size > 0) {
        const next = Array.from(pending);
        pending = null;
        void runTransform(next);
      }
    }
  }

  const collected = new Set<string>();
  const onChange = (changedPath: string): void => {
    collected.add(changedPath);
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      const paths = Array.from(collected);
      collected.clear();
      void runTransform(paths);
    }, WATCH_DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(opts.watch, {
    cwd: opts.projectDir,
    ignoreInitial: true,
  });
  watcher.on("add", onChange);
  watcher.on("change", onChange);
  watcher.on("unlink", onChange);
  return watcher;
}

export function startReloadWatcher(
  opts: { reloadOnChange: string[]; watchIgnore: string[] },
  runtime: { broadcast(event: string, data?: string): void }
): chokidar.FSWatcher | null {
  if (opts.reloadOnChange.length === 0) return null;

  let debounce: NodeJS.Timeout | null = null;
  const onChange = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      runtime.broadcast("reload");
    }, WATCH_DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(opts.reloadOnChange, {
    ignored: opts.watchIgnore.length > 0 ? opts.watchIgnore : undefined,
    ignoreInitial: true,
  });
  watcher.on("add", onChange);
  watcher.on("change", onChange);
  watcher.on("unlink", onChange);
  return watcher;
}
