import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { compose, dockerAvailable, waitForHealth } from "./compose-stack.js";
import { MIDDLEWARE_URL } from "./env.js";
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

// upstream_timeout Fault: the Sandbox Upstream goes silent for 10 s on every
// business endpoint, so the Sandbox Middleware's fixed client timeout
// (PARTNER_TIMEOUT_MS, default 3000) always fires first. Fingerprint: one
// outbound Call Record with status null, error_code ETIMEDOUT, no
// response_body, duration_ms pinned at the timeout; no retry; Caller sees 502
// saying the upstream timed out.
const UPSTREAM_DELAY_MS = 10_000;
const DEFAULT_TIMEOUT_MS = Number(process.env.PARTNER_TIMEOUT_MS ?? 3000);
// How far past the timeout the recorded duration may land: the clock stops
// once the abort has propagated out of fetch, which is a few ms at most.
const DURATION_TOLERANCE_MS = 500;

describe("upstream_timeout Fingerprint", () => {
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
      reply = await sendEnquiryWithFault("upstream_timeout", 11);
    });

    it("Caller sees 502 well within the 10 s upstream delay, saying the upstream timed out", () => {
      expectCallerSaw502(reply);
      expect(reply.elapsedMs).toBeLessThan(DEFAULT_TIMEOUT_MS + 2_000);
      expect(reply.elapsedMs).toBeLessThan(UPSTREAM_DELAY_MS);
      expect(reply.body.error).toMatch(/timed out/i);
    });

    it("leaves exactly one outbound Call Record: status null, error_code ETIMEDOUT, no response_body, duration pinned at the timeout", async () => {
      const result = await client.query(
        `SELECT url, status, error_code, response_body, duration_ms, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'outbound' ORDER BY id`,
        [reply.requestId],
      );
      expect(result.rows).toHaveLength(1);
      const [row] = result.rows;
      expect(row.url).toMatch(/\/partner\/enquiries$/);
      expect(row.status).toBeNull();
      expect(row.error_code).toBe("ETIMEDOUT");
      expect(row.response_body).toBeNull();
      expect(row.journey_id).toBe(reply.body.journey_id);
      expect(row.duration_ms).toBeGreaterThanOrEqual(DEFAULT_TIMEOUT_MS);
      expect(row.duration_ms).toBeLessThanOrEqual(DEFAULT_TIMEOUT_MS + DURATION_TOLERANCE_MS);
    });

    expectUpstreamFailure(() => ({ client, reply }), {
      naming: "naming the timeout",
      matches: [/timed out/i, /ETIMEDOUT/],
    });
  });

  describe("--fault upstream_timeout through the Caller script", () => {
    let line: CallerLine;
    let elapsedMs: number;

    beforeAll(async () => {
      const startedAt = Date.now();
      [line] = await runCaller("upstream_timeout");
      elapsedMs = Date.now() - startedAt;
    });

    it("returns 502, outcome upstream_failure, before the upstream would have answered", () => {
      expectUpstreamFailureLine(line);
      expect(elapsedMs).toBeLessThan(UPSTREAM_DELAY_MS);
    });

    it("leaves one outbound ETIMEDOUT Call Record with null status and an enquiries row failed", async () => {
      const calls = await client.query(
        `SELECT status, error_code, response_body, duration_ms FROM call_records
         WHERE request_id = $1 AND direction = 'outbound'`,
        [line.request_id],
      );
      expect(calls.rows).toHaveLength(1);
      expect(calls.rows[0].status).toBeNull();
      expect(calls.rows[0].error_code).toBe("ETIMEDOUT");
      expect(calls.rows[0].response_body).toBeNull();
      expect(calls.rows[0].duration_ms).toBeGreaterThanOrEqual(DEFAULT_TIMEOUT_MS);
      expect(calls.rows[0].duration_ms).toBeLessThanOrEqual(DEFAULT_TIMEOUT_MS + DURATION_TOLERANCE_MS);

      const enquiry = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [line.journey_id]);
      expect(enquiry.rows).toEqual([{ status: "failed" }]);
    });

    it("leaves the admin switch at none when it exits", async () => {
      expect(await readFault()).toBe("none");
    });
  });
});

// PARTNER_TIMEOUT_MS is the only thing that moves the recorded duration; the
// 10 s upstream delay is fixed. This block restarts ONLY the middleware
// service with a shorter timeout, so it needs `docker compose` and is skipped
// where Docker is not available (as admin-fault-env.test.ts does).
const SHORT_TIMEOUT_MS = 1_000;

// Compose reads the project name and host ports from the test process's env,
// the same way the runner passed them; PARTNER_TIMEOUT_MS is set on the command line.
async function restartMiddlewareWithTimeout(timeoutMs: string): Promise<void> {
  await compose(["up", "-d", "--no-build", "middleware"], { PARTNER_TIMEOUT_MS: timeoutMs });
  await waitForHealth("Sandbox Middleware", MIDDLEWARE_URL);
}

describe.skipIf(!dockerAvailable())("changing PARTNER_TIMEOUT_MS moves the recorded duration", () => {
  useFaultReset();

  const restoredTimeoutMs = process.env.PARTNER_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS);
  let client: pg.Client;
  let reply: EnquiryReply;

  beforeAll(async () => {
    client = await connectAsTriageRo();
    await restartMiddlewareWithTimeout(String(SHORT_TIMEOUT_MS));
    reply = await sendEnquiryWithFault("upstream_timeout", 12);
  });

  afterAll(async () => {
    // Put the middleware back on the timeout the rest of the suite expects.
    await restartMiddlewareWithTimeout(restoredTimeoutMs);
    await client.end();
  });

  it("with PARTNER_TIMEOUT_MS=1000 the Caller still sees 502, now within about a second", () => {
    expect(reply.status).toBe(502);
    expect(reply.body.error).toMatch(/timed out/i);
    expect(reply.elapsedMs).toBeLessThan(SHORT_TIMEOUT_MS + 2_000);
  });

  it("the outbound Call Record's duration_ms is pinned at the new timeout, still ETIMEDOUT with null status", async () => {
    const result = await client.query(
      `SELECT status, error_code, response_body, duration_ms FROM call_records
       WHERE request_id = $1 AND direction = 'outbound'`,
      [reply.requestId],
    );
    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row.status).toBeNull();
    expect(row.error_code).toBe("ETIMEDOUT");
    expect(row.response_body).toBeNull();
    expect(row.duration_ms).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MS);
    expect(row.duration_ms).toBeLessThanOrEqual(SHORT_TIMEOUT_MS + DURATION_TOLERANCE_MS);
    expect(row.duration_ms).toBeLessThan(DEFAULT_TIMEOUT_MS);
  });
});
