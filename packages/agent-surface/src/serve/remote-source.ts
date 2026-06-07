import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GithubBlobUrl = {
  owner: string;
  repo: string;
  segments: string[];
};

export type RemoteSource = {
  content: string;
  fileName: string;
  sourceUrl: string;
};

export type RemoteSourceFetchDeps = {
  runGhApi?: (endpoint: string) => Promise<string>;
  fetchText?: (url: string) => Promise<string>;
};

export function isRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseGithubBlobUrl(value: string): GithubBlobUrl | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") return null;
  return {
    owner: parts[0],
    repo: parts[1],
    segments: parts.slice(3).map(decodeURIComponent),
  };
}

function encodePathSegments(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

function fileNameFromUrl(value: string, fallback = "remote-source.html"): string {
  try {
    const url = new URL(value);
    const name = basename(decodeURIComponent(url.pathname));
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function runGhApi(endpoint: string): Promise<string> {
  const { stdout } = await execFileAsync("gh", ["api", "-H", "Accept: application/vnd.github.raw", endpoint], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function fetchText(url: string): Promise<string> {
  const { stdout } = await execFileAsync("curl", ["-fsSL", url], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

export async function fetchRemoteSource(sourceUrl: string, deps: RemoteSourceFetchDeps = {}): Promise<RemoteSource> {
  const github = parseGithubBlobUrl(sourceUrl);
  if (github) {
    const gh = deps.runGhApi ?? runGhApi;
    const errors: string[] = [];
    for (let refLength = 1; refLength < github.segments.length; refLength++) {
      const ref = github.segments.slice(0, refLength).join("/");
      const pathSegments = github.segments.slice(refLength);
      const path = encodePathSegments(pathSegments);
      const endpoint = `/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}/contents/${path}?ref=${encodeURIComponent(ref)}`;
      try {
        return {
          content: await gh(endpoint),
          fileName: basename(pathSegments[pathSegments.length - 1]) || "remote-source",
          sourceUrl,
        };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new Error(`Failed to fetch GitHub blob through gh api: ${errors[errors.length - 1] || sourceUrl}`);
  }

  const getText = deps.fetchText ?? fetchText;
  return {
    content: await getText(sourceUrl),
    fileName: fileNameFromUrl(sourceUrl),
    sourceUrl,
  };
}
