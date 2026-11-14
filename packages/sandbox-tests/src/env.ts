// Where the suite finds the running stack. Defaults match the default host
// ports in .env.example; parallel stacks override these per worktree.
export const MIDDLEWARE_URL = process.env.MIDDLEWARE_URL ?? "http://localhost:3001";
export const UPSTREAM_URL = process.env.UPSTREAM_URL ?? "http://localhost:3002";
export const TRIAGE_RO_DATABASE_URL =
  process.env.TRIAGE_RO_DATABASE_URL ??
  "postgresql://triage_ro:triage_ro_password_change_me@localhost:5432/sandbox";
// The bearer token the Sandbox Upstream expects; same default as .env.example.
export const PARTNER_TOKEN = process.env.PARTNER_TOKEN ?? "sandbox-token-change-me";
