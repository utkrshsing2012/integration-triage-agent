import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MIDDLEWARE_URL, TRIAGE_RO_DATABASE_URL } from "./env.js";
import { runCaller, type CallerLine } from "./run-caller.js";

// caller_error Fault: the Caller sends a malformed Enquiry (applicant.full_name
// missing). Fingerprint: an inbound 400 with no upstream call at all.
describe("caller_error Fingerprint (--fault caller_error)", () => {
  let client: pg.Client;
  let line: CallerLine;
  let enquiriesBefore: number;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TRIAGE_RO_DATABASE_URL });
    await client.connect();
    enquiriesBefore = Number((await client.query(`SELECT count(*) FROM enquiries`)).rows[0].count);
    [line] = await runCaller("caller_error");
  });

  afterAll(async () => {
    await client.end();
  });

  it("Caller sees 400, outcome caller_error, and no Journey Id", () => {
    expect(line.status).toBe(400);
    expect(line.outcome).toBe("caller_error");
    expect(line.journey_id).toBeNull();
    expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("the 400 body carries the Zod issues naming applicant.full_name", async () => {
    const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "term-life-basic",
        applicant: { date_of_birth: "1980-01-01", email: "a@example.invalid", phone: "+91 90000 10000" },
        sum_insured: 500000,
        documents: [{ name: "x.pdf", content_type: "application/pdf", content_base64: "JVBERi0=" }],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: Array<{ path: unknown[] }> };
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.issues.map((i) => i.path)).toContainEqual(["applicant", "full_name"]);
  });

  it("leaves one inbound Call Record with status 400 and zero outbound Call Records", async () => {
    const result = await client.query(
      `SELECT direction, status, journey_id, cycle_id, response_body FROM call_records WHERE request_id = $1`,
      [line.request_id],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ direction: "inbound", status: 400, journey_id: null, cycle_id: null });
    // The recorded response body is the Fingerprint's evidence: it names the missing field.
    const issues = result.rows[0].response_body.issues as Array<{ path: unknown[] }>;
    expect(issues.map((i) => i.path)).toContainEqual(["applicant", "full_name"]);
  });

  it("writes a warn Log Line under the Request Id and mints no enquiries row", async () => {
    const logs = await client.query(
      `SELECT level, message, journey_id FROM log_lines WHERE request_id = $1`,
      [line.request_id],
    );
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0]).toMatchObject({ level: "warn", journey_id: null });
    expect(logs.rows[0].message).toMatch(/rejected/);

    const enquiriesAfter = Number((await client.query(`SELECT count(*) FROM enquiries`)).rows[0].count);
    expect(enquiriesAfter).toBe(enquiriesBefore);
  });
});
