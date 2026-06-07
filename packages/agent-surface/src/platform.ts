import { spawn as spawnChild } from "node:child_process";

// ---------------------------------------------------------------------------
// Run-skill helper: focus previous app + (optionally) paste clipboard + press Enter.
//
// The user copies a slash command via the browser's clipboard API, then this
// switches focus to whatever app was last active (typically the agent chat
// they came from) and submits the prompt for them.
//
// Cross-platform parity:
//   darwin → `osascript -e ...` keystrokes (Cmd+Tab, Cmd+V, Return)
//   win32  → PowerShell SendKeys (%{TAB}, ^v, {ENTER})
//   linux  → `xdotool` (best-effort; may not be installed)
//
// If `send` is false, only the focus switch fires (no paste / Enter).
// ---------------------------------------------------------------------------
export type RefocusResult = { ok: boolean; reason?: string };

export async function runRefocusSequence(send: boolean): Promise<RefocusResult> {
  const platform = process.platform;
  if (platform === "darwin") {
    const args = [
      "-e", 'tell application "System Events" to keystroke tab using command down',
      "-e", "delay 0.18",
    ];
    if (send) {
      args.push(
        "-e", 'tell application "System Events" to keystroke "v" using command down',
        "-e", "delay 0.05",
        "-e", 'tell application "System Events" to key code 36', // Return
      );
    }
    return await spawnAndWait("osascript", args);
  }
  if (platform === "win32") {
    const lines: string[] = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "[System.Windows.Forms.SendKeys]::SendWait('%{TAB}')",
      "Start-Sleep -Milliseconds 180",
    ];
    if (send) {
      lines.push(
        "[System.Windows.Forms.SendKeys]::SendWait('^v')",
        "Start-Sleep -Milliseconds 60",
        "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
      );
    }
    return await spawnAndWait("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", lines.join("; ")]);
  }
  if (platform === "linux") {
    // xdotool is the most portable option; key sequence with built-in sleep.
    const args: string[] = ["key", "alt+Tab", "sleep", "0.18"];
    if (send) args.push("key", "ctrl+v", "sleep", "0.05", "key", "Return");
    const r = await spawnAndWait("xdotool", args);
    return r.ok ? r : { ok: false, reason: "xdotool-not-installed-or-failed" };
  }
  return { ok: false, reason: "unsupported-platform" };
}

function spawnAndWait(cmd: string, args: string[]): Promise<RefocusResult> {
  return new Promise((resolveOuter) => {
    const child = spawnChild(cmd, args, { stdio: "ignore" });
    child.on("close", (code) => resolveOuter({ ok: code === 0, reason: code === 0 ? undefined : `exit-${code}` }));
    child.on("error", (err) => resolveOuter({ ok: false, reason: String(err.message || err) }));
  });
}

// ---------------------------------------------------------------------------
// Open browser (cross-platform)
// ---------------------------------------------------------------------------
export function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  const child = spawnChild(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}
