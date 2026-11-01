// Id minting. request_id is a UUID per inbound request. journey_id and lead_id
// are minted together, one to one, with cycle_id (one Cycle per Enquiry in v1).
//
// The NNNNNN counter lives in memory, seeded once from the highest journey_id
// already in `enquiries`. That is safe because the Sandbox Middleware is the
// sole writer of database `sandbox` (ADR 004) and runs as one process, so a
// sequence or a lock would buy nothing here.
import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";

export function mintRequestId(): string {
  return randomUUID();
}

export interface EnquiryIds {
  journeyId: string; // QTN-YYYY-NNNNNN
  leadId: string; // LD-NNNNNN
  cycleId: string; // SUB-NNNNNN
}

let counter: number | null = null;

async function nextNumber(): Promise<number> {
  if (counter === null) {
    const latest = await prisma.enquiry.findFirst({
      orderBy: { journeyId: "desc" },
      select: { journeyId: true },
    });
    const tail = latest?.journeyId.split("-").at(-1);
    counter = tail ? Number(tail) : 0;
  }
  counter += 1;
  return counter;
}

export async function mintEnquiryIds(now = new Date()): Promise<EnquiryIds> {
  const n = String(await nextNumber()).padStart(6, "0");
  return {
    journeyId: `QTN-${now.getUTCFullYear()}-${n}`,
    leadId: `LD-${n}`,
    cycleId: `SUB-${n}`,
  };
}
