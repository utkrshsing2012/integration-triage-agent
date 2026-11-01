import { waitForHealth } from "./compose-stack.js";
import { MIDDLEWARE_URL, UPSTREAM_URL } from "./env.js";

export default async function setup(): Promise<void> {
  await Promise.all([
    waitForHealth("Sandbox Middleware", MIDDLEWARE_URL),
    waitForHealth("Sandbox Upstream", UPSTREAM_URL),
  ]);
}
