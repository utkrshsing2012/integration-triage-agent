// The five Faults the Sandbox Upstream can plant, and what each one does to
// the business endpoints. One handler per Fault, looked up by name in
// FAULT_HANDLERS; faultDispatch is the single middleware that applies the
// current one. A later Fault ticket replaces exactly one entry below and
// touches nothing else here.
import type { RequestHandler } from "express";

export const FAULTS = ["none", "schema_drift", "rate_limit_429", "auth_expired", "upstream_timeout"] as const;
export type Fault = (typeof FAULTS)[number];

export function isFault(value: unknown): value is Fault {
  return typeof value === "string" && (FAULTS as readonly string[]).includes(value);
}

// Initial Fault from env. An unknown value fails the boot rather than silently
// running clean: a stack that was told to start broken must start broken.
export function faultFromEnv(value: string | undefined): Fault {
  if (value === undefined || value === "") return "none";
  if (!isFault(value)) {
    throw new Error(`PARTNER_FAULT must be one of ${FAULTS.join("|")} (got "${value}")`);
  }
  return value;
}

// The business endpoints as the dispatch sees them (paths relative to /partner).
const CREATE_ENQUIRY = /^\/enquiries\/?$/;

const passThrough: RequestHandler = (_req, _res, next) => next();

// schema_drift: create-enquiry demands a field the Sandbox Middleware never
// sends. The other two endpoints are never reached because the middleware
// stops at the first failed call.
const schemaDrift: RequestHandler = (req, res, next) => {
  if (req.method === "POST" && CREATE_ENQUIRY.test(req.path)) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      field: "nominee_relationship",
      message: "nominee_relationship is required",
    });
    return;
  }
  next();
};

// rate_limit_429: every business endpoint is throttled. Retry-After says wait
// 30 seconds; the Sandbox Middleware's known weakness is to ignore it and retry
// at once, which is what makes the Fingerprint a burst of 429s milliseconds apart.
const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;
const rateLimit429: RequestHandler = (_req, res) => {
  res.set("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
  res.status(429).json({
    code: "RATE_LIMITED",
    message: `Too many requests; retry after ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds`,
  });
};

// auth_expired: every business endpoint answers 401 {code TOKEN_EXPIRED}. The
// token the Sandbox Middleware sends is the right one; the Partner has
// expired it. Deliberately a different code from UNAUTHORISED (wrong token,
// server.ts) so the two stay distinguishable in call_records.error_code.
const authExpired: RequestHandler = (_req, res) => {
  res.status(401).json({
    code: "TOKEN_EXPIRED",
    message: "Bearer token has expired; obtain a new token",
  });
};

// upstream_timeout: every business endpoint goes silent for UPSTREAM_DELAY_MS,
// then answers normally. The delay is fixed and well past the Sandbox
// Middleware's client timeout (PARTNER_TIMEOUT_MS), so the middleware always
// gives up first and the answer lands on a closed socket.
const UPSTREAM_DELAY_MS = 10_000;
const upstreamTimeout: RequestHandler = (_req, _res, next) => void setTimeout(next, UPSTREAM_DELAY_MS);

export const FAULT_HANDLERS: Record<Fault, RequestHandler> = {
  none: passThrough,
  schema_drift: schemaDrift,
  rate_limit_429: rateLimit429,
  auth_expired: authExpired,
  upstream_timeout: upstreamTimeout,
};

// Applied once, before the business routes. Reads the current Fault on every
// request so a POST to the admin switch takes effect immediately.
export function faultDispatch(currentFault: () => Fault): RequestHandler {
  return (req, res, next) => FAULT_HANDLERS[currentFault()](req, res, next);
}
