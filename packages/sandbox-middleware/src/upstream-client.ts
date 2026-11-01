// The single chokepoint for every call to the Sandbox Upstream (the Partner).
// One outbound Call Record per attempt. Fixed timeout, static bearer token,
// no refresh: these are the real middleware's weak spots, mirrored on purpose.
import type { Prisma } from "@prisma/client";
import { config } from "./config.js";
import { contextIds } from "./context.js";
import { prisma } from "./db.js";

// Retry and timeout policy as one object. Each later Fault ticket adds one
// field here instead of editing the control flow in callPartner:
//   #5 rate_limit_429: the retry rule (retry only on 429, three retries, zero delay, Retry-After ignored)
//   #6 auth_expired:   the token rule (static bearer, never refreshed, no retry on 401)
//   #7 upstream_timeout: timeoutMs below is the fixed client timeout (PARTNER_TIMEOUT_MS)
export const partnerPolicy = {
  timeoutMs: config.partnerTimeoutMs,
  bearerToken: config.partnerToken,
  // The retry rule, the whole of it. Only the listed statuses are retried (a
  // 500, a 401, a timeout are not), `retries` is the number of extra attempts
  // after the first, and `delayMs` is the wait between them. Retry-After from
  // the Partner is never read: that is the real middleware's weakness.
  retry: { onStatuses: [429] as readonly number[], retries: 3, delayMs: 0 },
};

export interface PartnerCall {
  method: "POST";
  path: string; // e.g. /partner/enquiries
  body?: unknown;
}

export interface PartnerResponse<T = unknown> {
  status: number;
  body: T;
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly errorCode: string | null,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

function errorCodeFor(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") return "ETIMEDOUT";
  const cause = (err as { cause?: { code?: string } })?.cause;
  return cause?.code ?? "EUNKNOWN";
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// The retry loop around one attempt. Every attempt writes its own outbound
// Call Record (inside attemptPartner), so an exhausted 429 leaves
// 1 + retries rows milliseconds apart under one Request Id: the Fingerprint.
export async function callPartner<T = unknown>(call: PartnerCall): Promise<PartnerResponse<T>> {
  const { onStatuses, retries, delayMs } = partnerPolicy.retry;
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptPartner<T>(call);
    } catch (err) {
      const retryable = err instanceof UpstreamError && err.status !== null && onStatuses.includes(err.status);
      if (!retryable) throw err;
      if (attempt > retries) {
        throw new UpstreamError(
          `${err.message} on all ${attempt} attempts; retries exhausted (Retry-After ignored)`,
          err.status,
          err.errorCode,
        );
      }
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// One attempt: one fetch, one outbound Call Record, whatever happened.
async function attemptPartner<T = unknown>(call: PartnerCall): Promise<PartnerResponse<T>> {
  const url = `${config.partnerBaseUrl}${call.path}`;
  const ids = contextIds();
  const startedAt = Date.now();

  let status: number | null = null;
  let responseBody: unknown = null;
  let errorCode: string | null = null;
  let failure: unknown = null;

  try {
    const res = await fetch(url, {
      method: call.method,
      headers: {
        authorization: `Bearer ${partnerPolicy.bearerToken}`,
        "content-type": "application/json",
      },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: AbortSignal.timeout(partnerPolicy.timeoutMs),
    });
    status = res.status;
    responseBody = await readJson(res);
    // A non-2xx answer carries the Partner's own code (VALIDATION_ERROR,
    // TOKEN_EXPIRED, RATE_LIMITED) in its body; the Call Record lifts it into
    // error_code so the Fingerprint is readable without parsing response_body.
    if (status < 200 || status >= 300) {
      errorCode = (responseBody as { code?: string } | null)?.code ?? null;
    }
  } catch (err) {
    failure = err;
    errorCode = errorCodeFor(err);
  }

  const durationMs = Date.now() - startedAt;

  await prisma.callRecord.create({
    data: {
      direction: "outbound",
      method: call.method,
      url,
      status,
      durationMs,
      requestBody: call.body as Prisma.InputJsonValue | undefined,
      responseBody: responseBody as Prisma.InputJsonValue | undefined,
      errorCode,
      requestId: ids.requestId ?? "00000000-0000-0000-0000-000000000000",
      journeyId: ids.journeyId,
      cycleId: ids.cycleId,
    },
  });

  if (failure !== null) {
    throw new UpstreamError(`${call.method} ${url} failed: ${errorCode}`, null, errorCode);
  }
  if (status === null || status < 200 || status >= 300) {
    throw new UpstreamError(`${call.method} ${url} answered ${status}`, status, errorCode);
  }
  return { status, body: responseBody as T };
}
