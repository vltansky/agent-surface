import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAgent,
  evaluate,
  score,
  type EvalResult,
  type PathgradeMeta,
  type ScoreResult,
} from "@wix/pathgrade";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = process.cwd();
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const MDX_SKILL_DIR = join(homedir(), ".agents/skills/agent-ui-mdx");
const HTML_SKILL_DIR = join(homedir(), ".agents/skills/agent-ui-serve-html");
const bridgeGlobal = ["window", "__as"].join(".");
const oldBridgeGlobal = ["window", "__au"].join(".");
const oldRegistry = ["npm", "dev", "wixpress", "com"].join(".");

export const __pathgradeMeta: PathgradeMeta = {
  alwaysRun: true,
};

describe("agent-surface skill e2e use cases", () => {
  it("creates an MDX review brief that Agent Surface can serve with source, plain text, and metadata routes", async () => {
    const agent = await createAgent({
      agent: "codex",
      timeout: 300,
      transport: "exec",
      debug: true,
      skillDir: MDX_SKILL_DIR,
      workspace: join(PACKAGE_ROOT, "__tests__", "fixtures", "mdx-review-brief"),
    });

    try {
      await agent.prompt(`Create review.mdx as a source-first review brief for the release note draft in release-notes.md.

The brief should help a teammate decide whether the release note is ready. Keep it readable as source, include a clear title, use at least one Agent Surface MDX component, include the main risk, and do not create a separate app or markdown file.`);

      const result = await evaluate(agent, [
        score("artifact contract (30 pts)", async ({ workspace }) => {
          const artifactPath = join(workspace, "review.mdx");
          if (!existsSync(artifactPath)) {
            return points(0, 30, ["review.mdx was not created"]);
          }
          const source = readFileSync(artifactPath, "utf8");

          return scoreChecks(30, [
            [5, "created review.mdx", true],
            [10, "imports Agent Surface MDX components", source.includes("agent-surface/mdx")],
            [5, "has a clear heading/title", /^#\s+\S/m.test(source) || /title:\s*\S/i.test(source)],
            [5, "mentions readiness, decision, or risk", /risk|ready|decision/i.test(source)],
            [5, "keeps the requested source-first MDX artifact", !existsSync(join(workspace, "review.md")) && !existsSync(join(workspace, "review.html"))],
          ]);
        }, { weight: 30 }),
        score("served MDX routes (30 pts)", async ({ workspace }) => {
          const served = await serveArtifact(workspace, "review.mdx");
          const metadata = parseJsonObject(served.metadata.body);
          const headings = Array.isArray(metadata?.headings) ? metadata.headings : [];
          const components = Array.isArray(metadata?.components) ? metadata.components : [];

          return scoreChecks(30, [
            [5, "rendered page returns 200", served.page.status === 200],
            [5, "/source.mdx exposes the editable artifact", served.source.status === 200 && served.source.body.includes("release")],
            [5, "/plain.md exposes agent-readable text", served.plain.status === 200 && served.plain.body.includes("release")],
            [5, "/metadata.json returns structured metadata", served.metadata.status === 200 && metadata !== null],
            [5, "metadata includes headings", headings.length > 0],
            [5, "metadata detects MDX components", components.length > 0],
          ]);
        }, { weight: 30 }),
        score("grounded review content (25 pts)", async ({ workspace }) => {
          const artifactPath = join(workspace, "review.mdx");
          if (!existsSync(artifactPath)) {
            return points(0, 25, ["review.mdx was not created"]);
          }
          const source = readFileSync(artifactPath, "utf8");

          return scoreChecks(25, [
            [5, "uses the release-note subject matter", /release note|release/i.test(source)],
            [5, "mentions machine-readable routes", /source\.mdx|plain\.md|metadata\.json|machine-readable/i.test(source)],
            [10, "captures the MDX vs HTML/JSX risk", /html|jsx|interactive|artifact type/i.test(source)],
            [5, "states a reviewer-facing recommendation or next step", /recommend|ready|fix|revise|ship|next/i.test(source)],
          ]);
        }, { weight: 25 }),
        score("current package contract (15 pts)", ({ transcript }) =>
          scoreChecks(15, [
            [5, "does not mention retired @wix/agents-ui package", !transcript.includes("@wix/agents-ui")],
            [5, "does not mention retired __au bridge", !transcript.includes(oldBridgeGlobal)],
            [5, "does not mention retired private npm registry", !transcript.includes(oldRegistry)],
          ]), { weight: 15 }),
      ]);

      reportScore("MDX_REVIEW_BRIEF", result);
      expect(scoreOutOf100(result)).toBeGreaterThanOrEqual(80);
    } finally {
      await agent.dispose();
    }
  });

  it("creates an HTML decision UI that returns structured JSON through the current browser bridge", async () => {
    const agent = await createAgent({
      agent: "codex",
      timeout: 300,
      transport: "exec",
      debug: true,
      skillDir: HTML_SKILL_DIR,
      workspace: join(PACKAGE_ROOT, "__tests__", "fixtures", "html-decision-ui"),
    });

    try {
      await agent.prompt(`Create decision.html for choosing what to do with the bug triage in bugs.json.

The UI should show the bug titles, let the reviewer choose ship, fix-first, or defer, include a note field, and finish by calling the Agent Surface browser bridge with structured JSON containing the decision and note. Do not use file:// instructions or any retired Agents UI package.`);

      const result = await evaluate(agent, [
        score("artifact and bridge contract (35 pts)", async ({ workspace }) => {
          const artifactPath = join(workspace, "decision.html");
          if (!existsSync(artifactPath)) {
            return points(0, 35, ["decision.html was not created"]);
          }
          const source = readFileSync(artifactPath, "utf8");

          return scoreChecks(35, [
            [5, "created decision.html", true],
            [15, "calls the current Agent Surface done bridge", callsCurrentDoneBridge(source)],
            [5, "returns a decision field", source.includes("decision")],
            [5, "returns a note field", source.includes("note")],
            [5, "does not call retired __au bridge", !source.includes(oldBridgeGlobal)],
          ]);
        }, { weight: 35 }),
        score("served UI behavior (30 pts)", async ({ workspace }) => {
          const served = await serveArtifact(workspace, "decision.html");
          const source = readFileSync(join(workspace, "decision.html"), "utf8");
          const visibleOrLoadableBugContext =
            served.page.body.includes("Login form overlaps") ||
            served.asset.body.includes("Login form overlaps") ||
            source.includes("bugs.json");
          const exposesDecisionChoices =
            (served.page.body.includes("ship") || source.includes("ship")) &&
            (served.page.body.includes("fix-first") || source.includes("fix-first")) &&
            (served.page.body.includes("defer") || source.includes("defer"));

          return scoreChecks(30, [
            [5, "served page returns 200", served.page.status === 200],
            [5, "served page includes injected __as bridge", served.page.body.includes(bridgeGlobal)],
            [10, "bug context is visible or loadable from served root", visibleOrLoadableBugContext],
            [5, "offers all requested decision choices", exposesDecisionChoices],
            [5, "sibling bugs.json is served when requested", served.asset.status === 200],
          ]);
        }, { weight: 30 }),
        score("triage workflow coverage (25 pts)", async ({ workspace }) => {
          const artifactPath = join(workspace, "decision.html");
          if (!existsSync(artifactPath)) {
            return points(0, 25, ["decision.html was not created"]);
          }
          const source = readFileSync(artifactPath, "utf8");

          return scoreChecks(25, [
            [5, "uses BUG-102 or login overlap context", /BUG-102|Login form overlaps/i.test(source)],
            [5, "uses BUG-117 or metadata preview context", /BUG-117|metadata link/i.test(source)],
            [10, "collects free-text reviewer notes", /textarea|note/i.test(source)],
            [5, "does not instruct users to open file://", !/file:\/\//i.test(source)],
          ]);
        }, { weight: 25 }),
        score("current package contract (10 pts)", ({ transcript }) =>
          scoreChecks(10, [
            [5, "does not mention retired @wix/agents-ui package", !transcript.includes("@wix/agents-ui")],
            [5, "does not mention retired private npm registry", !transcript.includes(oldRegistry)],
          ]), { weight: 10 }),
      ]);

      reportScore("HTML_DECISION_UI", result);
      expect(scoreOutOf100(result)).toBeGreaterThanOrEqual(80);
    } finally {
      await agent.dispose();
    }
  });
});

type ServedArtifact = {
  page: HttpResponse;
  source: HttpResponse;
  plain: HttpResponse;
  metadata: HttpResponse;
  asset: HttpResponse;
};

type HttpResponse = {
  status: number;
  body: string;
};

type PointCheck = [maxPoints: number, label: string, passed: boolean];

function scoreChecks(maxPoints: number, checks: PointCheck[]): ScoreResult {
  const earned = checks.reduce((sum, [pointsValue, , passed]) => sum + (passed ? pointsValue : 0), 0);
  const details = checks
    .map(([pointsValue, label, passed]) => `${passed ? "+" : "-"}${pointsValue} ${label}`)
    .join("; ");

  return points(earned, maxPoints, [details]);
}

function points(earned: number, maxPoints: number, details: string[]): ScoreResult {
  return {
    score: maxPoints === 0 ? 0 : earned / maxPoints,
    details: `${earned}/${maxPoints} pts: ${details.join("; ")}`,
  };
}

function scoreOutOf100(result: EvalResult): number {
  return Math.round(result.score * 100);
}

function reportScore(name: string, result: EvalResult): void {
  const total = scoreOutOf100(result);
  const breakdown = result.scorers
    .map((scorerResult) => {
      const earned = Math.round(scorerResult.score * scorerResult.weight);
      return `${scorerResult.name}: ${earned}/${scorerResult.weight}`;
    })
    .join(" | ");

  console.log(`AGENT_SURFACE_EVAL_SCORE ${name}=${total}/100`);
  console.log(`AGENT_SURFACE_EVAL_BREAKDOWN ${name}: ${breakdown}`);
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function serveArtifact(workspace: string, artifact: string): Promise<ServedArtifact> {
  const server = await startAgentSurfaceServer(workspace, artifact);

  try {
    const [page, source, plain, metadata, asset] = await Promise.all([
      getPage(server.port, "/"),
      getPage(server.port, "/source.mdx"),
      getPage(server.port, "/plain.md"),
      getPage(server.port, "/metadata.json"),
      getPage(server.port, "/bugs.json"),
    ]);
    await postDone(server.port, page.body);
    await waitForExit(server.proc);

    return { page, source, plain, metadata, asset };
  } finally {
    if (!server.proc.killed) {
      server.proc.kill("SIGTERM");
    }
  }
}

function startAgentSurfaceServer(
  cwd: string,
  artifact: string
): Promise<{ proc: ChildProcessWithoutNullStreams; port: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [CLI_PATH, "serve", artifact, "--no-open"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let resolved = false;

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Agent Surface server did not start for ${artifact}. stderr: ${stderr}`));
    }, 15_000);

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const match = stderr.match(/Serving at http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match || resolved) return;

      resolved = true;
      clearTimeout(timeout);
      resolve({ proc, port: Number(match[1]) });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (!resolved) {
        reject(new Error(`Agent Surface exited before serving ${artifact} with code ${code}. stderr: ${stderr}`));
      }
    });
  });
}

function getPage(port: number, path: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function postDone(port: number, pageBody: string): Promise<void> {
  const match = pageBody.match(/var sessionToken = '([^']+)'/);
  const sessionToken = match?.[1];
  if (!sessionToken) {
    throw new Error("Session token not found in served page");
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ action: "done", data: { ok: true } });
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/callback?token=${encodeURIComponent(sessionToken)}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "x-au-session-token": sessionToken,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Callback failed with status ${res.statusCode}`));
            return;
          }
          resolve();
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function waitForExit(proc: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    proc.once("close", () => resolve());
  });
}

function callsCurrentDoneBridge(source: string): boolean {
  return (
    source.includes(`${bridgeGlobal}.done`) ||
    source.includes(`${bridgeGlobal}?.done`) ||
    source.includes(`window["__as"].done`) ||
    source.includes(`window['__as'].done`) ||
    source.includes(`window["__as"]?.done`) ||
    source.includes(`window['__as']?.done`)
  );
}
