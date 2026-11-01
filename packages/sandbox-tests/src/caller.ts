// The Caller: sends Enquiries to the Sandbox Middleware and chooses the Fault
// for the run. Prints one JSON line per Enquiry: journey_id, HTTP status,
// outcome, request_id.
//
//   npx tsx src/caller.ts --fault none|caller_error|schema_drift|rate_limit_429|auth_expired|upstream_timeout --count <n>
//
// For the four upstream Faults it POSTs the admin switch on the Sandbox
// Upstream first, then sends valid Enquiries. For caller_error it sets the
// switch to none and sends the canonical malformed payload. The switch is
// reset to none at exit, whatever happened.
import { parseArgs } from "node:util";
import { MIDDLEWARE_URL, UPSTREAM_URL } from "./env.js";
import { CALLER_FAULTS, UPSTREAM_FAULTS, type CallerFault, type UpstreamFault } from "./fault-switch.js";
import { callerErrorEnquiry, seededEnquiry } from "./seed.js";

function isUpstreamFault(fault: CallerFault): fault is UpstreamFault {
  return (UPSTREAM_FAULTS as readonly string[]).includes(fault);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function setUpstreamFault(fault: UpstreamFault | "none"): Promise<void> {
  const res = await fetch(`${UPSTREAM_URL}/__admin/fault`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fault }),
  });
  if (res.status !== 200) {
    throw new Error(`POST ${UPSTREAM_URL}/__admin/fault {fault: ${fault}} answered ${res.status}`);
  }
}

function outcomeFor(status: number, body: { status?: string }): string {
  if (status === 201) return body.status ?? "submitted";
  if (status === 400) return "caller_error";
  return "upstream_failure";
}

async function sendEnquiry(fault: CallerFault, index: number): Promise<void> {
  const payload = fault === "caller_error" ? callerErrorEnquiry(index) : seededEnquiry(index);
  const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { journey_id?: string; status?: string };
  console.log(
    JSON.stringify({
      journey_id: body.journey_id ?? null,
      status: res.status,
      outcome: outcomeFor(res.status, body),
      request_id: res.headers.get("x-request-id"),
    }),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fault: { type: "string", default: "none" },
      count: { type: "string", default: "1" },
    },
  });
  const fault = values.fault as CallerFault;
  if (!CALLER_FAULTS.includes(fault)) {
    console.error(`--fault must be one of ${CALLER_FAULTS.join("|")} (got "${values.fault}")`);
    process.exit(2);
  }
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    console.error(`--count must be a positive integer (got "${values.count}")`);
    process.exit(2);
  }

  // A signal mid-run must not leave the Fault planted for the next run.
  const resetOnSignal = (signal: NodeJS.Signals) => {
    void setUpstreamFault("none")
      .catch(() => undefined)
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", resetOnSignal);
  process.once("SIGTERM", resetOnSignal);

  let runError: unknown;
  try {
    await setUpstreamFault(isUpstreamFault(fault) ? fault : "none");
    for (let i = 0; i < count; i++) {
      await sendEnquiry(fault, i);
    }
  } catch (err) {
    runError = err;
    throw err;
  } finally {
    // A failed reset is reported, but must not mask the error that got us here:
    // it is only thrown when the run itself succeeded.
    try {
      await setUpstreamFault("none");
    } catch (resetErr) {
      console.error(`could not reset the Fault to none: ${errorMessage(resetErr)}`);
      if (runError === undefined) throw resetErr;
    }
  }
}

main().catch((err) => {
  console.error(errorMessage(err));
  process.exit(1);
});
