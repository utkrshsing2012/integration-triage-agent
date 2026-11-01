// Driving the Compose stack from the suite: is Docker here, run `docker compose`
// from the repo root with the test process's env (project name, host ports)
// plus overrides, and wait for a service's /health to answer 200.
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const HEALTH_WAIT_MS = 60_000;
const HEALTH_POLL_MS = 500;

export function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function compose(args: string[], env: Record<string, string> = {}): Promise<void> {
  await execFileAsync("docker", ["compose", ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
}

export async function waitForHealth(name: string, url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_WAIT_MS;
  let lastError = "no attempt yet";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.status === 200) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(
    `${name} health at ${url}/health did not answer 200 within ${HEALTH_WAIT_MS}ms (last: ${lastError}). Is the Compose stack up?`,
  );
}
