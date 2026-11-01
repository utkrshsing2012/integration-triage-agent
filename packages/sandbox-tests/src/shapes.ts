// The shapes of the ids and bodies the sandbox hands out, spelled once so every
// test asserts the same thing.
export const JOURNEY_ID = /^QTN-\d{4}-\d{6}$/; // QTN-YYYY-NNNNNN
export const CYCLE_ID = /^SUB-\d{6}$/; // SUB-NNNNNN
export const LEAD_ID = /^LD-\d{6}$/; // LD-NNNNNN, one to one with the Journey Id
export const REQUEST_ID = /^[0-9a-f-]{36}$/; // UUID

// The 502 body the Sandbox Middleware returns to the Caller when a Partner call fails.
export interface UpstreamFailureBody {
  error: string;
  request_id: string;
  journey_id: string;
}
