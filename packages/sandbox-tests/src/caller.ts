// The Caller: sends Enquiries to the Sandbox Middleware and chooses the Fault
// for the run. Prints one JSON line per Enquiry: journey_id, HTTP status,
// outcome, request_id.
//
//   npx tsx src/caller.ts --fault none|caller_error --count <n>
//
// Upstream Faults (schema_drift, rate_limit_429, auth_expired, upstream_timeout)
// arrive with the admin switch in #4.
import { parseArgs } from "node:util";
import { MIDDLEWARE_URL } from "./env.js";
import { callerErrorEnquiry, seededEnquiry } from "./seed.js";

const SUPPORTED_FAULTS = ["none", "caller_error"] as const;
type Fault = (typeof SUPPORTED_FAULTS)[number];

function outcomeFor(status: number, body: { status?: string }): string {
  if (status === 201) return body.status ?? "submitted";
  if (status === 400) return "caller_error";
  return "upstream_failure";
}

async function sendEnquiry(fault: Fault, index: number): Promise<void> {
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
  const fault = values.fault as Fault;
  if (!SUPPORTED_FAULTS.includes(fault)) {
    console.error(`--fault must be one of ${SUPPORTED_FAULTS.join("|")} (got "${values.fault}")`);
    process.exit(2);
  }
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    console.error(`--count must be a positive integer (got "${values.count}")`);
    process.exit(2);
  }
  for (let i = 0; i < count; i++) {
    await sendEnquiry(fault, i);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
