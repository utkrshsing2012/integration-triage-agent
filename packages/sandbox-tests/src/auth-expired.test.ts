import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { UPSTREAM_URL } from "./env.js";
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

// auth_expired Fault: every business endpoint on the Sandbox Upstream answers
// 401 {code TOKEN_EXPIRED}. The Sandbox Middleware never refreshes its static
// bearer token and does not retry a 401, so the first outbound call fails and
// the Caller sees 502. Fingerprint: one 401 TOKEN_EXPIRED Call Record per
// Journey, on every Journey after the switch, nothing Journey-specific.
describe("auth_expired Fingerprint", () => {
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
      reply = await sendEnquiryWithFault("auth_expired", 11);
    });

    it("Caller sees 502 with error, request_id, and journey_id in the body", () => {
      expectCallerSaw502(reply);
    });

    it("leaves exactly one outbound Call Record: status 401, error_code TOKEN_EXPIRED, no retry", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [reply.requestId],
      );
      expect(result.rows).toHaveLength(1);
      const [row] = result.rows;
      expect(row.url).toMatch(/\/partner\/enquiries$/);
      expect(row.status).toBe(401);
      expect(row.error_code).toBe("TOKEN_EXPIRED");
      expect(row.journey_id).toBe(reply.body.journey_id);
      expect(row.response_body).toMatchObject({ code: "TOKEN_EXPIRED" });
    });

    expectUpstreamFailure(() => ({ client, reply }), {
      naming: "naming 401 or TOKEN_EXPIRED",
      matches: [/401|TOKEN_EXPIRED/],
    });
  });

  // The wrong-token 401 (UNAUTHORISED) and the expired-token 401 (TOKEN_EXPIRED)
  // must stay distinguishable, or the Triage Service could not tell "the
  // Partner expired our token" from "we are sending the wrong token".
  describe("a wrong bearer token is a different 401 from an expired one", () => {
    it("with Fault none, a wrong token answers 401 UNAUTHORISED, not TOKEN_EXPIRED", async () => {
      const res = await fetch(`${UPSTREAM_URL}/partner/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer not-the-sandbox-token" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("UNAUTHORISED");
      expect(json.code).not.toBe("TOKEN_EXPIRED");
    });

    it("with auth_expired planted, the bearer check still wins for a wrong token, so the codes never collide", async () => {
      await setFault("auth_expired");
      const wrong = await fetch(`${UPSTREAM_URL}/partner/enquiries`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer not-the-sandbox-token" },
        body: JSON.stringify({}),
      });
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ code: "UNAUTHORISED" });
    });

    it("the Sandbox Middleware's correct token under auth_expired lands TOKEN_EXPIRED, never UNAUTHORISED, in call_records", async () => {
      const reply = await sendEnquiryWithFault("auth_expired", 12);
      expect(reply.status).toBe(502);
      const result = await client.query(
        `SELECT error_code FROM call_records WHERE request_id = $1 AND direction = 'outbound'`,
        [reply.requestId],
      );
      expect(result.rows).toEqual([{ error_code: "TOKEN_EXPIRED" }]);
      const unauthorised = await client.query(
        `SELECT count(*) FROM call_records WHERE request_id = $1 AND error_code = 'UNAUTHORISED'`,
        [reply.requestId],
      );
      expect(Number(unauthorised.rows[0].count)).toBe(0);
    });
  });

  describe("--fault auth_expired --count 3 through the Caller script", () => {
    let lines: CallerLine[];

    beforeAll(async () => {
      lines = await runCaller("auth_expired", 3);
    });

    it("returns 502 with request_id and journey_id for each of three distinct Journeys, outcome upstream_failure", () => {
      expect(lines).toHaveLength(3);
      for (const line of lines) expectUpstreamFailureLine(line);
      expect(new Set(lines.map((l) => l.journey_id)).size).toBe(3);
    });

    it("leaves each Journey with exactly one outbound 401 TOKEN_EXPIRED row and an enquiries row failed", async () => {
      for (const line of lines) {
        const calls = await client.query(
          `SELECT status, error_code FROM call_records WHERE journey_id = $1 AND direction = 'outbound'`,
          [line.journey_id],
        );
        expect(calls.rows).toEqual([{ status: 401, error_code: "TOKEN_EXPIRED" }]);

        const enquiry = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [line.journey_id]);
        expect(enquiry.rows).toEqual([{ status: "failed" }]);
      }
    });

    it("leaves the admin switch at none when it exits", async () => {
      expect(await readFault()).toBe("none");
    });
  });
});
