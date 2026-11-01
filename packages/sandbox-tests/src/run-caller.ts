// Drives the Caller script as a child process, exactly as a human would from
// the shell, and parses its stdout: one JSON line per Enquiry.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import type { CallerFault } from "./fault-switch.js";

const execFileAsync = promisify(execFile);

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface CallerLine {
  journey_id: string | null;
  status: number;
  outcome: string;
  request_id: string | null;
}

// `env` overrides are laid over the test process's own env, e.g. to point the
// Caller at a dead port and watch how it exits.
export async function runCaller(
  fault: CallerFault,
  count = 1,
  env: Record<string, string> = {},
): Promise<CallerLine[]> {
  const { stdout } = await execFileAsync(
    "npx",
    ["tsx", "src/caller.ts", "--fault", fault, "--count", String(count)],
    { cwd: PACKAGE_ROOT, env: { ...process.env, ...env } },
  );
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CallerLine);
}
