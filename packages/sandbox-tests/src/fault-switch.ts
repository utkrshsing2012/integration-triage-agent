// The admin switch on the Sandbox Upstream, as the eval suite drives it:
// read the current Fault, plant one, reset to none. Every Fault test file
// calls useFaultReset() so the suite never leaks a Fault into the next test.
//
// No `import ... from "vitest"` here: the Caller script imports this file's
// Fault list and runs under tsx, where loading vitest throws ("Vitest failed
// to access its internal state"). The hooks and `expect` below are the Vitest
// globals (`globals: true` in vitest.config.ts, typed by vitest/globals).
import { UPSTREAM_URL } from "./env.js";

// The Fault list, spelled once for the whole test package. The Sandbox
// Upstream keeps its own copy: tests never import app code.
export const UPSTREAM_FAULTS = ["schema_drift", "rate_limit_429", "auth_expired", "upstream_timeout"] as const;
export const FAULTS = ["none", ...UPSTREAM_FAULTS] as const;
// The Caller takes one more name: caller_error is not planted on the switch,
// it is a malformed Enquiry the Caller sends itself.
export const CALLER_FAULTS = ["none", "caller_error", ...UPSTREAM_FAULTS] as const;

export type UpstreamFault = (typeof UPSTREAM_FAULTS)[number];
export type Fault = (typeof FAULTS)[number];
export type CallerFault = (typeof CALLER_FAULTS)[number];

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

// Shared by every Fault test file: no Fault may be planted when a test starts,
// and whatever a test planted is reset after it.
export function useFaultReset(): void {
  // Runs before the file's own beforeAll, which may run the Caller; the Caller
  // sets the switch itself, so only a check that runs first can catch a Fault
  // a previous file left planted.
  beforeAll(async () => {
    expect(await readFault(), "a previous Fault test file left a Fault planted").toBe("none");
  });
  beforeEach(async () => {
    expect(await readFault(), "a previous Fault test left a Fault planted").toBe("none");
  });
  afterEach(resetFaultToNone);
}
