// What every planted-Fault test does besides checking its own Fingerprint:
// plant the Fault and send one Enquiry, read the rows back as triage_ro, and
// assert the marks every upstream failure leaves.
import { expect, it } from "vitest";
import pg from "pg";
import { MIDDLEWARE_URL, TRIAGE_RO_DATABASE_URL } from "./env.js";
import { resetFaultToNone, setFault, type UpstreamFault } from "./fault-switch.js";
import type { CallerLine } from "./run-caller.js";
import { seededEnquiry } from "./seed.js";
import { JOURNEY_ID, REQUEST_ID, type UpstreamFailureBody } from "./shapes.js";

export async function connectAsTriageRo(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: TRIAGE_RO_DATABASE_URL });
  await client.connect();
  return client;
}

export interface EnquiryReply {
  status: number;
  body: UpstreamFailureBody;
  requestId: string;
  elapsedMs: number; // how long the Caller waited for the answer
}

// Plants the Fault, sends one valid Enquiry to the Sandbox Middleware, and
// resets the switch, as the Caller does for one Enquiry.
export async function sendEnquiryWithFault(fault: UpstreamFault, seed: number): Promise<EnquiryReply> {
  await setFault(fault);
  try {
    const startedAt = Date.now();
    const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(seededEnquiry(seed)),
    });
    const elapsedMs = Date.now() - startedAt;
    return {
      status: res.status,
      body: (await res.json()) as UpstreamFailureBody,
      requestId: res.headers.get("x-request-id")!,
      elapsedMs,
    };
  } finally {
    await resetFaultToNone();
  }
}

export function expectCallerSaw502(reply: EnquiryReply): void {
  expect(reply.status).toBe(502);
  expect(reply.body.error).toEqual(expect.any(String));
  expect(reply.body.request_id).toBe(reply.requestId);
  expect(reply.body.journey_id).toMatch(JOURNEY_ID);
}

export function expectUpstreamFailureLine(line: CallerLine): void {
  expect(line.status).toBe(502);
  expect(line.outcome).toBe("upstream_failure");
  expect(line.journey_id).toMatch(JOURNEY_ID);
  expect(line.request_id).toMatch(REQUEST_ID);
}

// The four marks every upstream Fault leaves besides its own Fingerprint.
// Registers four tests in the enclosing describe; `current` is read inside
// each test, after that describe's beforeAll has sent the Enquiry.
export function expectUpstreamFailure(
  current: () => { client: pg.Client; reply: EnquiryReply },
  logLine: { naming: string; matches: RegExp[] },
): void {
  it("never calls upload-documents or finalise-submission for that Journey", async () => {
    const { client, reply } = current();
    const result = await client.query(
      `SELECT count(*) FROM call_records
       WHERE journey_id = $1 AND direction = 'outbound' AND (url LIKE '%/documents' OR url LIKE '%/finalise')`,
      [reply.body.journey_id],
    );
    expect(Number(result.rows[0].count)).toBe(0);
  });

  it("updates the inbound Call Record to status 502 with the 502 body", async () => {
    const { client, reply } = current();
    const result = await client.query(
      `SELECT status, duration_ms, response_body, journey_id FROM call_records
       WHERE request_id = $1 AND direction = 'inbound'`,
      [reply.requestId],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ status: 502, journey_id: reply.body.journey_id });
    expect(result.rows[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.rows[0].response_body).toMatchObject({
      error: reply.body.error,
      request_id: reply.requestId,
      journey_id: reply.body.journey_id,
    });
  });

  it("sets the enquiries row to status failed", async () => {
    const { client, reply } = current();
    const result = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [reply.body.journey_id]);
    expect(result.rows).toEqual([{ status: "failed" }]);
  });

  it(`writes an error-level Log Line ${logLine.naming} under the Request Id and Journey Id`, async () => {
    const { client, reply } = current();
    const result = await client.query(
      `SELECT message, context FROM log_lines WHERE request_id = $1 AND journey_id = $2 AND level = 'error'`,
      [reply.requestId, reply.body.journey_id],
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(result.rows);
    for (const pattern of logLine.matches) expect(text).toMatch(pattern);
  });
}
