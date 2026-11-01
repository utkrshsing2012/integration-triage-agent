import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MIDDLEWARE_URL, TRIAGE_RO_DATABASE_URL } from "./env.js";
import { readFault, setFault, useFaultReset } from "./fault-switch.js";
import { runCaller, type CallerLine } from "./run-caller.js";
import { seededEnquiry } from "./seed.js";

// schema_drift Fault: the Sandbox Upstream answers create-enquiry with 400
// naming a field the Sandbox Middleware never sends. Fingerprint: one outbound
// 400 whose body names an unknown field, no later call, Caller sees 502.
describe("schema_drift Fingerprint", () => {
  useFaultReset();

  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TRIAGE_RO_DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  describe("one Enquiry sent while the Fault is planted", () => {
    let status: number;
    let body: { error: string; request_id: string; journey_id: string };
    let requestId: string;

    beforeAll(async () => {
      await setFault("schema_drift");
      const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seededEnquiry(7)),
      });
      status = res.status;
      body = (await res.json()) as typeof body;
      requestId = res.headers.get("x-request-id")!;
    });

    it("Caller sees 502 with error, request_id, and journey_id in the body", () => {
      expect(status).toBe(502);
      expect(body.error).toEqual(expect.any(String));
      expect(body.request_id).toBe(requestId);
      expect(body.journey_id).toMatch(/^QTN-\d{4}-\d{6}$/);
    });

    it("leaves exactly one outbound Call Record: create-enquiry, status 400, body naming nominee_relationship", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [requestId],
      );
      expect(result.rows).toHaveLength(1);
      const [row] = result.rows;
      expect(row.url).toMatch(/\/partner\/enquiries$/);
      expect(row.status).toBe(400);
      expect(row.error_code).toBe("VALIDATION_ERROR");
      expect(row.journey_id).toBe(body.journey_id);
      expect(row.response_body).toMatchObject({ code: "VALIDATION_ERROR", field: "nominee_relationship" });
      expect(row.response_body.message).toMatch(/nominee_relationship/);
    });

    it("never calls upload-documents or finalise-submission for that Journey", async () => {
      const result = await client.query(
        `SELECT count(*) FROM call_records
         WHERE journey_id = $1 AND direction = 'outbound' AND (url LIKE '%/documents' OR url LIKE '%/finalise')`,
        [body.journey_id],
      );
      expect(Number(result.rows[0].count)).toBe(0);
    });

    it("updates the inbound Call Record to status 502 with the 502 body", async () => {
      const result = await client.query(
        `SELECT status, duration_ms, response_body, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'inbound'`,
        [requestId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ status: 502, journey_id: body.journey_id });
      expect(result.rows[0].duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.rows[0].response_body).toMatchObject({ request_id: requestId, journey_id: body.journey_id });
    });

    it("sets the enquiries row to status failed", async () => {
      const result = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [body.journey_id]);
      expect(result.rows).toEqual([{ status: "failed" }]);
    });

    it("writes an error-level Log Line under the Request Id and Journey Id", async () => {
      const result = await client.query(
        `SELECT message, context FROM log_lines WHERE request_id = $1 AND journey_id = $2 AND level = 'error'`,
        [requestId, body.journey_id],
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(result.rows)).toMatch(/400|VALIDATION_ERROR/);
    });
  });

  describe("--fault schema_drift through the Caller script", () => {
    let line: CallerLine;

    beforeAll(async () => {
      [line] = await runCaller("schema_drift");
    });

    it("returns 502 with request_id and journey_id, outcome upstream_failure", () => {
      expect(line.status).toBe(502);
      expect(line.outcome).toBe("upstream_failure");
      expect(line.journey_id).toMatch(/^QTN-\d{4}-\d{6}$/);
      expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("leaves one outbound 400 Call Record naming nominee_relationship and an enquiries row failed", async () => {
      const calls = await client.query(
        `SELECT status, response_body FROM call_records WHERE request_id = $1 AND direction = 'outbound'`,
        [line.request_id],
      );
      expect(calls.rows).toHaveLength(1);
      expect(calls.rows[0].status).toBe(400);
      expect(calls.rows[0].response_body.field).toBe("nominee_relationship");

      const enquiry = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [line.journey_id]);
      expect(enquiry.rows).toEqual([{ status: "failed" }]);
    });

    it("leaves the admin switch at none when it exits", async () => {
      expect(await readFault()).toBe("none");
    });
  });
});
