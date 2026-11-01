import { MIDDLEWARE_URL, UPSTREAM_URL } from "./env.js";

const WAIT_MS = 60_000;
const POLL_MS = 500;

async function waitForHealth(name: string, url: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  let lastError = "no attempt yet";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.status === 200) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(
    `${name} health at ${url}/health did not answer 200 within ${WAIT_MS}ms (last: ${lastError}). Is the Compose stack up?`,
  );
}

export default async function setup(): Promise<void> {
  await Promise.all([
    waitForHealth("Sandbox Middleware", MIDDLEWARE_URL),
    waitForHealth("Sandbox Upstream", UPSTREAM_URL),
  ]);
}
