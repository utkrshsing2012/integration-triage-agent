import { describe, expect, it } from "vitest";
import { UPSTREAM_URL } from "./env.js";
import { FAULTS, readFault, setFault, useFaultReset } from "./fault-switch.js";

// The admin switch: the eval harness's control plane on the Sandbox Upstream.
// The Triage Service never calls this.
describe("Sandbox Upstream admin switch (/__admin/fault)", () => {
  useFaultReset();

  it("reads none when nothing has been planted", async () => {
    expect(await readFault()).toBe("none");
  });

  it.each(FAULTS)("POST %s answers 200 and GET reflects it", async (fault) => {
    const res = await setFault(fault);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fault });
    expect(await readFault()).toBe(fault);
  });

  it("rejects an unknown Fault with 400 and leaves the current Fault unchanged", async () => {
    await setFault("schema_drift");
    const res = await setFault("disk_full");
    expect(res.status).toBe(400);
    expect(await readFault()).toBe("schema_drift");
  });

  it("rejects a body without a fault field with 400", async () => {
    const res = await fetch(`${UPSTREAM_URL}/__admin/fault`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await readFault()).toBe("none");
  });

  it("needs no bearer token: the admin switch is not a Partner business endpoint", async () => {
    const res = await fetch(`${UPSTREAM_URL}/__admin/fault`);
    expect(res.status).toBe(200);
  });
});
