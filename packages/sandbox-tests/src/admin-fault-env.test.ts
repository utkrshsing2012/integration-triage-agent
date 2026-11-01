import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { UPSTREAM_URL } from "./env.js";
import { readFault, setFault } from "./fault-switch.js";
import { runCaller } from "./run-caller.js";

// The Sandbox Upstream takes its initial Fault from env PARTNER_FAULT and holds
// it only in process memory, so a stack can boot already broken and a container
// restart is a full reset. This file drives `docker compose` on the upstream
// service, so it is skipped where Docker is not available.
const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Compose reads the project name and host ports from the test process's env,
// the same way the runner passed them; PARTNER_FAULT is set on the command line.
async function compose(args: string[], env: Record<string, string>): Promise<void> {
  await execFileAsync("docker", ["compose", ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
}

async function waitForUpstreamHealth(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${UPSTREAM_URL}/health`)).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sandbox Upstream at ${UPSTREAM_URL} did not come back within 60s`);
}

describe.skipIf(!dockerAvailable())("Sandbox Upstream initial Fault from env PARTNER_FAULT", () => {
  const restoredFault = process.env.PARTNER_FAULT ?? "none";

  beforeAll(async () => {
    await compose(["up", "-d", "--no-build", "upstream"], { PARTNER_FAULT: "schema_drift" });
    await waitForUpstreamHealth();
  });

  afterAll(async () => {
    // Put the upstream back on the env the rest of the suite expects.
    await compose(["up", "-d", "--no-build", "upstream"], { PARTNER_FAULT: restoredFault });
    await waitForUpstreamHealth();
  });

  it("a container started with PARTNER_FAULT=schema_drift reports it before any POST", async () => {
    expect(await readFault()).toBe("schema_drift");
  });

  it("a POST overrides it in memory, and a container restart resets it to the env value", async () => {
    await setFault("none");
    expect(await readFault()).toBe("none");

    await compose(["restart", "upstream"], {});
    await waitForUpstreamHealth();
    expect(await readFault()).toBe("schema_drift");
  });

  it("after the env is restored, a clean-path run goes end to end again", async () => {
    await compose(["up", "-d", "--no-build", "upstream"], { PARTNER_FAULT: restoredFault });
    await waitForUpstreamHealth();
    expect(await readFault()).toBe(restoredFault);

    const [line] = await runCaller("none");
    expect(line.status).toBe(201);
  });
});
