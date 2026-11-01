// The admin switch on the Sandbox Upstream, as the eval harness drives it:
// read the current Fault, plant one, reset to none. Every Fault scenario
// calls useFaultReset() so the suite never leaks a Fault into the next file.
import { afterEach, beforeAll, expect } from "vitest";
import { UPSTREAM_URL } from "./env.js";

export const FAULTS = ["none", "schema_drift", "rate_limit_429", "auth_expired", "upstream_timeout"] as const;
export type Fault = (typeof FAULTS)[number];

export async function readFault(): Promise<string> {
  const res = await fetch(`${UPSTREAM_URL}/__admin/fault`);
  if (res.status !== 200) throw new Error(`GET /__admin/fault answered ${res.status}`);
  const body = (await res.json()) as { fault: string };
  return body.fault;
}

export async function setFault(fault: string): Promise<Response> {
  return fetch(`${UPSTREAM_URL}/__admin/fault`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fault }),
  });
}

export async function resetFaultToNone(): Promise<void> {
  const res = await setFault("none");
  if (res.status !== 200) throw new Error(`resetting the Fault to none answered ${res.status}`);
}

// Shared by every Fault scenario: the scenario must start with no Fault
// planted, and whatever a test planted is reset after it.
export function useFaultReset(): void {
  beforeAll(async () => {
    expect(await readFault(), "a previous scenario left a Fault planted").toBe("none");
  });
  afterEach(resetFaultToNone);
}
