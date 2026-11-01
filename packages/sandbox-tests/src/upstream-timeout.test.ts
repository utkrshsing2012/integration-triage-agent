import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { MIDDLEWARE_URL, TRIAGE_RO_DATABASE_URL } from "./env.js";
import { readFault, setFault, useFaultReset } from "./fault-switch.js";
import { runCaller, type CallerLine } from "./run-caller.js";
import { seededEnquiry } from "./seed.js";

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

interface Reply {
  status: number;
  body: { error: string; request_id: string; journey_id: string };
  requestId: string;
  elapsedMs: number;
}

async function sendEnquiryUnderTimeout(seed: number): Promise<Reply> {
  await setFault("upstream_timeout");
  const startedAt = Date.now();
  const res = await fetch(`${MIDDLEWARE_URL}/enquiries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(seededEnquiry(seed)),
  });
  const elapsedMs = Date.now() - startedAt;
  return {
    status: res.status,
    body: (await res.json()) as Reply["body"],
    requestId: res.headers.get("x-request-id")!,
    elapsedMs,
  };
}

describe("upstream_timeout Fingerprint", () => {
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
    let reply: Reply;

    beforeAll(async () => {
      reply = await sendEnquiryUnderTimeout(11);
    });

    it("Caller sees 502 well within the 10 s upstream delay, saying the upstream timed out", () => {
      expect(reply.status).toBe(502);
      expect(reply.elapsedMs).toBeLessThan(DEFAULT_TIMEOUT_MS + 2_000);
      expect(reply.elapsedMs).toBeLessThan(UPSTREAM_DELAY_MS);
      expect(reply.body.error).toMatch(/timed out/i);
      expect(reply.body.request_id).toBe(reply.requestId);
      expect(reply.body.journey_id).toMatch(/^QTN-\d{4}-\d{6}$/);
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

    it("updates the inbound Call Record to status 502 with the 502 body", async () => {
      const result = await client.query(
        `SELECT status, response_body, journey_id FROM call_records
         WHERE request_id = $1 AND direction = 'inbound'`,
        [reply.requestId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ status: 502, journey_id: reply.body.journey_id });
      expect(result.rows[0].response_body.error).toMatch(/timed out/i);
    });

    it("sets the enquiries row to status failed", async () => {
      const result = await client.query(`SELECT status FROM enquiries WHERE journey_id = $1`, [
        reply.body.journey_id,
      ]);
      expect(result.rows).toEqual([{ status: "failed" }]);
    });

    it("writes an error-level Log Line naming the timeout under the Request Id and Journey Id", async () => {
      const result = await client.query(
        `SELECT message, context FROM log_lines
         WHERE request_id = $1 AND journey_id = $2 AND level = 'error'`,
        [reply.requestId, reply.body.journey_id],
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const text = JSON.stringify(result.rows);
      expect(text).toMatch(/timed out/i);
      expect(text).toMatch(/ETIMEDOUT/);
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
      expect(line.status).toBe(502);
      expect(line.outcome).toBe("upstream_failure");
      expect(line.journey_id).toMatch(/^QTN-\d{4}-\d{6}$/);
      expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/);
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
const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SHORT_TIMEOUT_MS = 1_000;

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Compose reads the project name and host ports from the test process's env,
// the same way the runner passed them; PARTNER_TIMEOUT_MS is set on the command line.
async function restartMiddlewareWithTimeout(timeoutMs: string): Promise<void> {
  await execFileAsync("docker", ["compose", "up", "-d", "--no-build", "middleware"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PARTNER_TIMEOUT_MS: timeoutMs },
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${MIDDLEWARE_URL}/health`)).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sandbox Middleware at ${MIDDLEWARE_URL} did not come back within 60s`);
}

describe.skipIf(!dockerAvailable())("changing PARTNER_TIMEOUT_MS moves the recorded duration", () => {
  useFaultReset();

  const restoredTimeoutMs = process.env.PARTNER_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS);
  let client: pg.Client;
  let reply: Reply;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TRIAGE_RO_DATABASE_URL });
    await client.connect();
    await restartMiddlewareWithTimeout(String(SHORT_TIMEOUT_MS));
    reply = await sendEnquiryUnderTimeout(12);
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
