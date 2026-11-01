import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { useFaultReset } from "./fault-switch.js";
import { connectAsTriageRo } from "./planted-fault.js";
import { runCaller, type CallerLine } from "./run-caller.js";

// Correlation: every row one Enquiry produced shares the Journey Id, and every
// outbound Call Record shares the inbound Call Record's Request Id.
describe("Correlation across one Enquiry", () => {
  // Registered before this file's own beforeAll: the Caller resets the switch
  // itself, so only a check that runs first can catch a Fault left planted.
  useFaultReset();

  let client: pg.Client;
  let line: CallerLine;

  beforeAll(async () => {
    client = await connectAsTriageRo();
    [line] = await runCaller("none");
    expect(line.status).toBe(201);
  });

  afterAll(async () => {
    await client.end();
  });

  it("every Call Record and Log Line of the Enquiry shares the Journey Id and Cycle Id", async () => {
    const enquiry = await client.query(`SELECT cycle_id FROM enquiries WHERE journey_id = $1`, [line.journey_id]);
    const cycleId = enquiry.rows[0].cycle_id;

    const calls = await client.query(`SELECT journey_id, cycle_id FROM call_records WHERE request_id = $1`, [
      line.request_id,
    ]);
    const logs = await client.query(`SELECT journey_id, cycle_id FROM log_lines WHERE request_id = $1`, [
      line.request_id,
    ]);
    expect(calls.rows.length).toBeGreaterThan(0);
    expect(logs.rows.length).toBeGreaterThan(0);
    for (const row of [...calls.rows, ...logs.rows]) {
      expect(row).toEqual({ journey_id: line.journey_id, cycle_id: cycleId });
    }
  });

  it("every outbound Call Record shares the inbound Call Record's Request Id", async () => {
    const inbound = await client.query(
      `SELECT request_id FROM call_records WHERE journey_id = $1 AND direction = 'inbound'`,
      [line.journey_id],
    );
    expect(inbound.rows).toHaveLength(1);
    const outbound = await client.query(
      `SELECT request_id FROM call_records WHERE journey_id = $1 AND direction = 'outbound'`,
      [line.journey_id],
    );
    expect(outbound.rows).toHaveLength(3);
    for (const row of outbound.rows) {
      expect(row.request_id).toBe(inbound.rows[0].request_id);
    }
  });

  it("no row of another Journey carries this Enquiry's Request Id", async () => {
    const result = await client.query(
      `SELECT count(*) FROM call_records WHERE request_id = $1 AND journey_id IS DISTINCT FROM $2`,
      [line.request_id, line.journey_id],
    );
    expect(Number(result.rows[0].count)).toBe(0);
  });
});
