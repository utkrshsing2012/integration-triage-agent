import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { readFault, useFaultReset } from "./fault-switch.js";
import { runCaller } from "./run-caller.js";
import { CYCLE_ID } from "./shapes.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Caller script", () => {
  useFaultReset();

  it("rejects a Fault name it does not know with exit code 2", async () => {
    await expect(runCaller("disk_full" as never)).rejects.toMatchObject({ code: 2 });
  });

  it("resets the admin switch to none when it exits on an error", async () => {
    // Plant an upstream Fault, then point the Caller at a port nothing listens on:
    // the switch is set, the Enquiry fails, the finally block still resets it.
    await expect(
      runCaller("schema_drift", 1, { MIDDLEWARE_URL: "http://127.0.0.1:9" }),
    ).rejects.toMatchObject({ code: 1 });
    expect(await readFault()).toBe("none");
  });

  it("--count 3 produces three distinct Journey Ids, all submitted", async () => {
    const lines = await runCaller("none", 3);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.status)).toEqual([201, 201, 201]);
    expect(new Set(lines.map((l) => l.journey_id)).size).toBe(3);
  });

  it("Sandbox Middleware stdout carries each Log Line as one JSON object with the three ids", async () => {
    const [line] = await runCaller("none");
    // docker compose reads the project name from the repo root's env file, or its default.
    const { stdout } = await execFileAsync("docker", ["compose", "logs", "--no-log-prefix", "middleware"], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = stdout
      .split("\n")
      .filter((l) => l.trim().startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const ours = parsed.filter((l) => l.request_id === line.request_id);
    expect(ours.map((l) => l.message)).toEqual(expect.arrayContaining(["enquiry received", "submitted"]));
    for (const entry of ours) {
      expect(entry).toMatchObject({ journey_id: line.journey_id, cycle_id: expect.stringMatching(CYCLE_ID) });
      expect(["info", "warn", "error"]).toContain(entry.level);
    }
  });
});
