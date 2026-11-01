// The single chokepoint for every call to the Sandbox Upstream (the Partner).
// One outbound Call Record per attempt. Fixed timeout, static bearer token,
// no refresh: these are the real middleware's weak spots, mirrored on purpose.
import type { Prisma } from "@prisma/client";
import { config } from "./config.js";
import { contextIds } from "./context.js";
import { prisma } from "./db.js";

// Retry and timeout policy as one object. Later Faults add fields here
// (#6: retry on 429, three attempts, zero delay) instead of editing control flow.
export const partnerPolicy = {
  timeoutMs: config.partnerTimeoutMs,
  bearerToken: config.partnerToken,
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

export async function callPartner<T = unknown>(call: PartnerCall): Promise<PartnerResponse<T>> {
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
    const code = (responseBody as { code?: string } | null)?.code ?? null;
    throw new UpstreamError(`${call.method} ${url} answered ${status}`, status, code);
  }
  return { status, body: responseBody as T };
}
