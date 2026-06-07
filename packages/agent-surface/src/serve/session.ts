import { existsSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

export type ReusableSessionOptions = {
  sessionDir: string;
  reuseKey: string;
  printSummary: boolean;
};

export function resolveSessionDir(sessionDirOverride: string, reuseKey: string): string {
  if (sessionDirOverride) return sessionDirOverride;
  if (reuseKey) {
    const hash = createHash("sha256").update(reuseKey).digest("hex").slice(0, 8);
    return join(tmpdir(), `au-${hash}`);
  }
  return join(process.env.TMPDIR || tmpdir(), `agent-surface-serve-${randomBytes(4).toString("hex")}`);
}

export function tryReuseExisting(opts: ReusableSessionOptions): boolean {
  if (!opts.reuseKey) return false;
  const sessionFile = join(opts.sessionDir, "session.json");
  if (!existsSync(sessionFile)) return false;
  let session: { port?: number; url?: string; pid?: number };
  try {
    session = JSON.parse(readFileSync(sessionFile, "utf-8"));
  } catch {
    return false;
  }
  if (!session.pid || !session.url) return false;
  try {
    process.kill(session.pid, 0);
  } catch {
    return false;
  }
  process.stdout.write(session.url + "\n");
  if (opts.printSummary) {
    const summaryFile = join(opts.sessionDir, "summary.txt");
    if (existsSync(summaryFile)) {
      process.stdout.write(readFileSync(summaryFile, "utf-8"));
    }
  }
  return true;
}
