import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { runCaller } from "./run-caller.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Caller script", () => {
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
      expect(entry).toMatchObject({ journey_id: line.journey_id, cycle_id: expect.stringMatching(/^SUB-\d{6}$/) });
      expect(["info", "warn", "error"]).toContain(entry.level);
    }
  });
});
