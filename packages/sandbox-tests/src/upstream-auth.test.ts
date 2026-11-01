import { describe, expect, it } from "vitest";
import { UPSTREAM_URL } from "./env.js";

// The Sandbox Upstream's static bearer check. UNAUTHORISED is deliberately a
// different code from TOKEN_EXPIRED (the auth_expired Fault, #6).
describe("Sandbox Upstream bearer check", () => {
  it.each([
    ["/partner/enquiries", {}],
    ["/partner/enquiries/PRT-TEST/documents", { documents: [] }],
    ["/partner/enquiries/PRT-TEST/finalise", {}],
  ])("POST %s with a wrong token answers 401 UNAUTHORISED", async (path, body) => {
    const res = await fetch(`${UPSTREAM_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer not-the-sandbox-token" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORISED" });
  });
});
