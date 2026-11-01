import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { MIDDLEWARE_URL, UPSTREAM_URL } from "./env.js";
import { connectAsTriageRo } from "./planted-fault.js";

describe("Stack skeleton: health endpoints", () => {
  it("Sandbox Middleware answers 200 on /health", async () => {
    const res = await fetch(`${MIDDLEWARE_URL}/health`);
    expect(res.status).toBe(200);
  });

  it("Sandbox Upstream answers 200 on /health", async () => {
    const res = await fetch(`${UPSTREAM_URL}/health`);
    expect(res.status).toBe(200);
  });
});

describe("Stack skeleton: database sandbox as triage_ro", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = await connectAsTriageRo();
  });

  afterAll(async () => {
    await client.end();
  });

  it.each(["enquiries", "call_records", "log_lines"])(
    "SELECT on %s succeeds",
    async (table) => {
      // Proves the grant, not emptiness: the Sandbox Middleware writes rows from #3 on.
      const result = await client.query(`SELECT * FROM ${table} LIMIT 1`);
      expect(result.rows.length).toBeLessThanOrEqual(1);
    },
  );

  it("INSERT into log_lines fails with a permission error", async () => {
    await expect(
      client.query(
        `INSERT INTO log_lines (level, message) VALUES ('info', 'triage_ro must never write')`,
      ),
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
  });

  // The columns are the record shape step 1's adapter reads. Spec #1, Implementation Decisions.
  const expectedColumns: Record<string, string[]> = {
    enquiries: ["journey_id", "lead_id", "cycle_id", "status", "created_at", "updated_at"],
    call_records: [
      "id",
      "ts",
      "direction",
      "method",
      "url",
      "status",
      "duration_ms",
      "request_body",
      "response_body",
      "error_code",
      "request_id",
      "journey_id",
      "cycle_id",
    ],
    log_lines: ["id", "ts", "level", "message", "context", "request_id", "journey_id", "cycle_id"],
  };

  it.each(Object.entries(expectedColumns))(
    "%s has exactly the spec's columns",
    async (table, columns) => {
      const result = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      expect(result.rows.map((r) => r.column_name).sort()).toEqual([...columns].sort());
    },
  );

  it("enquiries has journey_id as primary key and lead_id unique", async () => {
    // pg_catalog, not information_schema: table_constraints hides tables the
    // current role only has SELECT on, which is exactly triage_ro's position.
    const pk = await client.query<{ attname: string }>(
      `SELECT a.attname
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.conrelid = 'public.enquiries'::regclass AND c.contype = 'p'`,
    );
    expect(pk.rows).toEqual([{ attname: "journey_id" }]);

    // Prisma expresses @unique as a unique index, not a UNIQUE constraint.
    const unique = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'enquiries' AND indexdef LIKE 'CREATE UNIQUE INDEX%'`,
    );
    const uniqueColumns = unique.rows.map((r) => r.indexdef.match(/\(([^)]+)\)/)?.[1]);
    expect(uniqueColumns).toContain("lead_id");
  });

  const expectedIndexes: Array<[string, string]> = [
    ["call_records", "journey_id"],
    ["call_records", "request_id"],
    ["log_lines", "journey_id"],
  ];

  it.each(expectedIndexes)("%s is indexed on %s", async (table, column) => {
    const result = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [table],
    );
    const indexedColumns = result.rows.map((r) => r.indexdef.match(/\(([^)]+)\)/)?.[1]);
    expect(indexedColumns).toContain(column);
  });
});
