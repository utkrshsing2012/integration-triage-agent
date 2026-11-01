import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { PARTNER_TOKEN, UPSTREAM_URL } from "./env.js";
import { readFault, setFault, useFaultReset } from "./fault-switch.js";
import {
  connectAsTriageRo,
  expectCallerSaw502,
  expectUpstreamFailure,
  expectUpstreamFailureLine,
  sendEnquiryWithFault,
  type EnquiryReply,
} from "./planted-fault.js";
import { runCaller, type CallerLine } from "./run-caller.js";
import { CYCLE_ID } from "./shapes.js";

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
    client = await connectAsTriageRo();
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
          headers: { "content-type": "application/json", authorization: `Bearer ${PARTNER_TOKEN}` },
          body: JSON.stringify({}),
        });
        expect(res.status, path).toBe(429);
        expect(res.headers.get("retry-after"), path).toBe(String(RETRY_AFTER_SECONDS));
        expect(await res.json(), path).toMatchObject({ code: "RATE_LIMITED" });
      }
    });
  });

  describe("one Enquiry sent while the Fault is planted", () => {
    let reply: EnquiryReply;

    beforeAll(async () => {
      reply = await sendEnquiryWithFault("rate_limit_429", 11);
    });

    it("Caller sees 502 with error, request_id, and journey_id in the body", () => {
      expectCallerSaw502(reply);
    });

    it("leaves exactly four outbound Call Records, all 429 RATE_LIMITED, all to create-enquiry", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, journey_id, cycle_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [reply.requestId],
      );
      expect(result.rows).toHaveLength(ATTEMPTS);
      for (const row of result.rows) {
        expect(row.url).toMatch(/\/partner\/enquiries$/);
        expect(row.status).toBe(429);
        expect(row.error_code).toBe("RATE_LIMITED");
        expect(row.response_body).toMatchObject({ code: "RATE_LIMITED" });
        expect(row.journey_id).toBe(reply.body.journey_id);
        expect(row.cycle_id).toMatch(CYCLE_ID);
      }
    });

    it("fires the burst in well under the Retry-After value (retries have no delay)", async () => {
      const result = await client.query(
        `SELECT extract(epoch FROM (max(ts) - min(ts))) * 1000 AS span_ms FROM call_records
         WHERE request_id = $1 AND direction = 'outbound'`,
        [reply.requestId],
      );
      const spanMs = Number(result.rows[0].span_ms);
      expect(spanMs).toBeGreaterThanOrEqual(0);
      expect(spanMs).toBeLessThan(2_000);
      expect(spanMs).toBeLessThan(RETRY_AFTER_SECONDS * 1000);
    });

    expectUpstreamFailure(() => ({ client, reply }), {
      naming: "naming rate limiting",
      matches: [/rate.?limit/i, /RATE_LIMITED/],
    });
  });

  describe("the retry rule applies to 429 only", () => {
    // schema_drift is the one planted Fault that answers a non-429 error, so it
    // stands in for "a 500 would not be retried": one attempt, no retry.
    it("does not retry a non-429 Partner answer: a single outbound Call Record", async () => {
      const reply = await sendEnquiryWithFault("schema_drift", 12);
      expect(reply.status).toBe(502);
      const result = await client.query(
        `SELECT status FROM call_records WHERE request_id = $1 AND direction = 'outbound'`,
        [reply.requestId],
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
      expectUpstreamFailureLine(line);
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
