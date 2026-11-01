import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { useFaultReset } from "./fault-switch.js";
import { connectAsTriageRo } from "./planted-fault.js";
import { runCaller, type CallerLine } from "./run-caller.js";
import { CYCLE_ID, JOURNEY_ID, LEAD_ID, REQUEST_ID } from "./shapes.js";

// Clean path: no Fault. Arrows 1 to 11 of docs/drawings/step-0.md, asserted
// through the Caller's reply and the rows triage_ro can read.
describe("Clean path Fingerprint (--fault none)", () => {
  // Registered before this file's own beforeAll: the Caller resets the switch
  // itself, so only a check that runs first can catch a Fault left planted.
  useFaultReset();

  let client: pg.Client;
  let line: CallerLine;

  beforeAll(async () => {
    client = await connectAsTriageRo();
    [line] = await runCaller("none");
  });

  afterAll(async () => {
    await client.end();
  });

  it("Caller sees 201 with a Journey Id and outcome submitted", () => {
    expect(line.status).toBe(201);
    expect(line.outcome).toBe("submitted");
    expect(line.journey_id).toMatch(JOURNEY_ID);
    expect(line.request_id).toMatch(REQUEST_ID);
  });

  it("enquiries row has status submitted with a one-to-one lead_id and a cycle_id", async () => {
    const result = await client.query(
      `SELECT journey_id, lead_id, cycle_id, status FROM enquiries WHERE journey_id = $1`,
      [line.journey_id],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ journey_id: line.journey_id, status: "submitted" });
    expect(result.rows[0].lead_id).toMatch(LEAD_ID);
    expect(result.rows[0].cycle_id).toMatch(CYCLE_ID);
  });

  it("leaves one inbound Call Record (201) and three outbound Call Records (200) under one Request Id", async () => {
    const result = await client.query(
      `SELECT direction, method, url, status, duration_ms, error_code, journey_id, cycle_id
       FROM call_records WHERE request_id = $1 ORDER BY id`,
      [line.request_id],
    );
    const inbound = result.rows.filter((r) => r.direction === "inbound");
    const outbound = result.rows.filter((r) => r.direction === "outbound");

    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ method: "POST", url: "/enquiries", status: 201, error_code: null });
    expect(inbound[0].duration_ms).toBeGreaterThanOrEqual(0);

    expect(outbound).toHaveLength(3);
    expect(outbound.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(outbound.map((r) => r.error_code)).toEqual([null, null, null]);
    // create-enquiry, upload-documents, finalise-submission, in that order.
    expect(outbound.map((r) => r.url)).toEqual([
      expect.stringMatching(/\/partner\/enquiries$/),
      expect.stringMatching(/\/partner\/enquiries\/[^/]+\/documents$/),
      expect.stringMatching(/\/partner\/enquiries\/[^/]+\/finalise$/),
    ]);

    const enquiry = await client.query(`SELECT cycle_id FROM enquiries WHERE journey_id = $1`, [
      line.journey_id,
    ]);
    for (const row of result.rows) {
      expect(row.journey_id).toBe(line.journey_id);
      expect(row.cycle_id).toBe(enquiry.rows[0].cycle_id);
    }
  });

  it("writes Log Lines for the run carrying the three ids", async () => {
    const result = await client.query(
      `SELECT level, message, request_id, journey_id, cycle_id FROM log_lines WHERE journey_id = $1 ORDER BY id`,
      [line.journey_id],
    );
    const messages = result.rows.map((r) => r.message);
    expect(messages).toContain("enquiry received");
    expect(messages).toContain("submitted");
    for (const row of result.rows) {
      expect(row.request_id).toBe(line.request_id);
      expect(row.journey_id).toBe(line.journey_id);
      expect(row.cycle_id).toMatch(CYCLE_ID);
    }
  });
});
