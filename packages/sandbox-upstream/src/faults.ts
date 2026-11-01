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

export const FAULT_HANDLERS: Record<Fault, RequestHandler> = {
  none: passThrough,
  schema_drift: schemaDrift,
  rate_limit_429: passThrough, // #5 replaces: every business endpoint answers 429, Retry-After 30, {code RATE_LIMITED}
  auth_expired: passThrough, // #6 replaces: every business endpoint answers 401 {code TOKEN_EXPIRED}
  upstream_timeout: passThrough, // #7 replaces: every business endpoint waits 10 s, then answers 200
};

// Applied once, before the business routes. Reads the current Fault on every
// request so a POST to the admin switch takes effect immediately.
export function faultDispatch(currentFault: () => Fault): RequestHandler {
  return (req, res, next) => FAULT_HANDLERS[currentFault()](req, res, next);
}
