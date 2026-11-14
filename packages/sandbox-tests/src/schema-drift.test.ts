import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { readFault, useFaultReset } from "./fault-switch.js";
import {
  connectAsTriageRo,
  expectCallerSaw502,
  expectUpstreamFailure,
  expectUpstreamFailureLine,
  sendEnquiryWithFault,
  type EnquiryReply,
} from "./planted-fault.js";
import { runCaller, type CallerLine } from "./run-caller.js";

// schema_drift Fault: the Sandbox Upstream answers create-enquiry with 400
// naming a field the Sandbox Middleware never sends. Fingerprint: one outbound
// 400 whose body names an unknown field, no later call, Caller sees 502.
describe("schema_drift Fingerprint", () => {
  useFaultReset();

  let client: pg.Client;

  beforeAll(async () => {
    client = await connectAsTriageRo();
  });

  afterAll(async () => {
    await client.end();
  });

  describe("one Enquiry sent while the Fault is planted", () => {
    let reply: EnquiryReply;

    beforeAll(async () => {
      reply = await sendEnquiryWithFault("schema_drift", 7);
    });

    it("Caller sees 502 with error, request_id, and journey_id in the body", () => {
      expectCallerSaw502(reply);
    });

    it("leaves exactly one outbound Call Record: create-enquiry, status 400, body naming nominee_relationship", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [reply.requestId],
      );
      expect(result.rows).toHaveLength(1);
      const [row] = result.rows;
      expect(row.url).toMatch(/\/partner\/enquiries$/);
      expect(row.status).toBe(400);
      expect(row.error_code).toBe("VALIDATION_ERROR");
      expect(row.journey_id).toBe(reply.body.journey_id);
      expect(row.response_body).toMatchObject({ code: "VALIDATION_ERROR", field: "nominee_relationship" });
      expect(row.response_body.message).toMatch(/nominee_relationship/);
    });

    expectUpstreamFailure(() => ({ client, reply }), {
      naming: "naming 400 or VALIDATION_ERROR",
      matches: [/400|VALIDATION_ERROR/],
    });
  });

  describe("--fault schema_drift through the Caller script", () => {
    let line: CallerLine;

    beforeAll(async () => {
      [line] = await runCaller("schema_drift");
    });

    it("returns 502 with request_id and journey_id, outcome upstream_failure", () => {
      expectUpstreamFailureLine(line);
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
