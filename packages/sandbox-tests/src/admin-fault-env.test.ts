import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose, dockerAvailable, waitForHealth } from "./compose-stack.js";
import { UPSTREAM_URL } from "./env.js";
import { readFault, setFault } from "./fault-switch.js";
import { runCaller } from "./run-caller.js";

// The Sandbox Upstream takes its initial Fault from env PARTNER_FAULT and holds
// it only in process memory, so a stack can boot already broken and a container
// restart is a full reset. This file drives `docker compose` on the upstream
// service, so it is skipped where Docker is not available. Compose reads the
// project name and host ports from the test process's env, the same way the
// runner passed them; PARTNER_FAULT is set on the command line.
const waitForUpstreamHealth = () => waitForHealth("Sandbox Upstream", UPSTREAM_URL);

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
