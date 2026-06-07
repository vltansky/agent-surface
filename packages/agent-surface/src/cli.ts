import { serveUI } from "./serve";

function printUsage(): void {
  console.log("Usage: agent-surface serve <file.html|file.jsx|file.tsx|file.mdx|url> [opts]");
  console.log("");
  console.log("Commands:");
  console.log("  serve <file|url> [opts]   Serve an HTML/JSX/TSX/MDX file with interactive UI, return user input as JSON");
}

async function main(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;
  if (command === "serve") {
    await serveUI(commandArgs);
    return;
  }
  if (command === "--help" || command === "-h" || !command) {
    printUsage();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
