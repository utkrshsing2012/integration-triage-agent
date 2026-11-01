import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MIDDLEWARE_URL, TRIAGE_RO_DATABASE_URL, UPSTREAM_URL } from "./env.js";
import { readFault, setFault, useFaultReset } from "./fault-switch.js";
import { runCaller, type CallerLine } from "./run-caller.js";
import { seededEnquiry } from "./seed.js";

// rate_limit_429 Fault: the Sandbox Upstream answers every business endpoint
// with 429 and Retry-After 30. The Sandbox Middleware's deliberate weakness is
// to retry a 429 three times with zero delay, ignoring Retry-After, so the
// Caller sees 502. Fingerprint: a burst of four 429 Call Records milliseconds
// apart under one Request Id, all to create-enquiry, gaps far below Retry-After.
const RETRY_AFTER_SECONDS = 30;
const ATTEMPTS = 4; // one call plus three retries

describe("rate_limit_429 Fingerprint", () => {
  useFaultReset();

  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TRIAGE_RO_DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  describe("the Sandbox Upstream while the Fault is planted", () => {
    it("answers every business endpoint 429 with Retry-After 30 and {code RATE_LIMITED}", async () => {
      await setFault("rate_limit_429");
      for (const path of ["/partner/enquiries", "/partner/enquiries/PRT-TEST/documents", "/partner/enquiries/PRT-TEST/finalise"]) {
        const res = await fetch(`${UPSTREAM_URL}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer sandbox-token-change-me" },
          body: JSON.stringify({}),
        });
        expect(res.status, path).toBe(429);
        expect(res.headers.get("retry-after"), path).toBe(String(RETRY_AFTER_SECONDS));
        expect(await res.json(), path).toMatchObject({ code: "RATE_LIMITED" });
      }
    });
  });

  describe("one Enquiry sent while the Fault is planted", () => {
    let status: number;
    let body: { error: string; request_id: string; journey_id: string };
    let requestId: string;

    beforeAll(async () => {
      await setFault("rate_limit_429");
      const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seededEnquiry(11)),
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

    it("leaves exactly four outbound Call Records, all 429 RATE_LIMITED, all to create-enquiry", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, journey_id, cycle_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [requestId],
      );
      expect(result.rows).toHaveLength(ATTEMPTS);
      for (const row of result.rows) {
        expect(row.url).toMatch(/\/partner\/enquiries$/);
        expect(row.status).toBe(429);
        expect(row.error_code).toBe("RATE_LIMITED");
        expect(row.response_body).toMatchObject({ code: "RATE_LIMITED" });
        expect(row.journey_id).toBe(body.journey_id);
        expect(row.cycle_id).toMatch(/^SUB-\d{6}$/);
      }
    });

    it("fires the burst in well under the Retry-After value (retries have no delay)", async () => {
      const result = await client.query(
        `SELECT extract(epoch FROM (max(ts) - min(ts))) * 1000 AS span_ms FROM call_records
         WHERE request_id = $1 AND direction = 'outbound'`,
        [requestId],
      );
      const spanMs = Number(result.rows[0].span_ms);
      expect(spanMs).toBeGreaterThanOrEqual(0);
      expect(spanMs).toBeLessThan(2_000);
      expect(spanMs).toBeLessThan(RETRY_AFTER_SECONDS * 1000);
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
      expect(result.rows[0].response_body).toMatchObject({ request_id: requestId, journey_id: body.journey_id });
    });

    it("sets the enquiries row to status failed", async () => {
      const result = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [body.journey_id]);
      expect(result.rows).toEqual([{ status: "failed" }]);
    });

    it("writes an error-level Log Line naming rate limiting under the Request Id and Journey Id", async () => {
      const result = await client.query(
        `SELECT message, context FROM log_lines WHERE request_id = $1 AND journey_id = $2 AND level = 'error'`,
        [requestId, body.journey_id],
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(result.rows)).toMatch(/rate.?limit/i);
      expect(JSON.stringify(result.rows)).toMatch(/RATE_LIMITED/);
    });
  });

  describe("the retry rule applies to 429 only", () => {
    // schema_drift is the one planted Fault that answers a non-429 error, so it
    // stands in for "a 500 would not be retried": one attempt, no retry.
    it("does not retry a non-429 Partner answer: a single outbound Call Record", async () => {
      await setFault("schema_drift");
      const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seededEnquiry(12)),
      });
      expect(res.status).toBe(502);
      const requestId = res.headers.get("x-request-id")!;
      const result = await client.query(
        `SELECT status FROM call_records WHERE request_id = $1 AND direction = 'outbound'`,
        [requestId],
      );
      expect(result.rows).toEqual([{ status: 400 }]);
    });
  });

  describe("--fault rate_limit_429 through the Caller script", () => {
    let line: CallerLine;

    beforeAll(async () => {
      [line] = await runCaller("rate_limit_429");
    });

    it("returns 502 with request_id and journey_id, outcome upstream_failure", () => {
      expect(line.status).toBe(502);
      expect(line.outcome).toBe("upstream_failure");
      expect(line.journey_id).toMatch(/^QTN-\d{4}-\d{6}$/);
      expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("leaves four outbound 429 Call Records within two seconds and an enquiries row failed", async () => {
      const calls = await client.query(
        `SELECT status, error_code, extract(epoch FROM (max(ts) OVER () - min(ts) OVER ())) * 1000 AS span_ms
         FROM call_records WHERE request_id = $1 AND direction = 'outbound'`,
        [line.request_id],
      );
      expect(calls.rows).toHaveLength(ATTEMPTS);
      for (const row of calls.rows) {
        expect(row.status).toBe(429);
        expect(row.error_code).toBe("RATE_LIMITED");
        expect(Number(row.span_ms)).toBeLessThan(2_000);
      }

      const enquiry = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [line.journey_id]);
      expect(enquiry.rows).toEqual([{ status: "failed" }]);
    });

    it("leaves the admin switch at none when it exits", async () => {
      expect(await readFault()).toBe("none");
    });
  });
});
