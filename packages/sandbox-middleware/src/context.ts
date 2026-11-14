// Request-scoped context: the three ids every Log Line and Call Record carries.
// AsyncLocalStorage means no handler passes ids by hand; the logger and the
// upstream client read them from here.
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  journeyId: string | null; // null until the Enquiry validates (caller_error never mints one)
  cycleId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

// The three ids as columns, for any row written inside (or outside) a request.
export function contextIds(): { requestId: string | null; journeyId: string | null; cycleId: string | null } {
  const ctx = storage.getStore();
  return {
    requestId: ctx?.requestId ?? null,
    journeyId: ctx?.journeyId ?? null,
    cycleId: ctx?.cycleId ?? null,
  };
}
