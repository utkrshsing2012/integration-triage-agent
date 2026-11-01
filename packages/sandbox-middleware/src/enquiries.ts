// POST /enquiries: Arrows 1 to 11 of docs/drawings/step-0.md, in order.
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { currentContext } from "./context.js";
import { prisma } from "./db.js";
import { EnquirySchema } from "./enquiry-schema.js";
import { mintEnquiryIds } from "./ids.js";
import { logger } from "./logger.js";
import { callPartner } from "./upstream-client.js";

export const enquiries = Router();

enquiries.post("/enquiries", async (req, res) => {
  const ctx = currentContext()!;
  const startedAt = Date.now();

  // Arrow 2: inbound Call Record, inserted now with null status, updated at the end.
  const inbound = await prisma.callRecord.create({
    data: {
      direction: "inbound",
      method: req.method,
      url: req.originalUrl,
      status: null,
      requestBody: req.body as Prisma.InputJsonValue,
      requestId: ctx.requestId,
    },
  });

  const finish = async (status: number, body: unknown) => {
    await prisma.callRecord.update({
      where: { id: inbound.id },
      data: {
        status,
        durationMs: Date.now() - startedAt,
        responseBody: body as Prisma.InputJsonValue,
        journeyId: ctx.journeyId,
        cycleId: ctx.cycleId,
      },
    });
    res.status(status).json(body);
  };

  // caller_error: 400 with the Zod issues, no Journey minted, no upstream call.
  const parsed = EnquirySchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path, message: i.message, code: i.code }));
    await logger.warn("enquiry rejected: validation failed", { issues });
    await finish(400, { error: "VALIDATION_ERROR", issues });
    return;
  }
  const enquiry = parsed.data;

  // Arrow 1: mint the Journey Id (with its one-to-one lead id) and the Cycle Id.
  const ids = await mintEnquiryIds();
  ctx.journeyId = ids.journeyId;
  ctx.cycleId = ids.cycleId;
  await prisma.enquiry.create({
    data: { journeyId: ids.journeyId, leadId: ids.leadId, cycleId: ids.cycleId, status: "received" },
  });

  // Arrow 3.
  await logger.info("enquiry received", {
    product: enquiry.product,
    documents: enquiry.documents.length,
    lead_id: ids.leadId,
  });

  // Arrows 4 to 9: three calls in order through the one chokepoint.
  const created = await callPartner<{ partner_ref: string }>({
    method: "POST",
    path: "/partner/enquiries",
    body: { product: enquiry.product, applicant: enquiry.applicant, sum_insured: enquiry.sum_insured },
  });
  const ref = encodeURIComponent(created.body.partner_ref);

  await callPartner({
    method: "POST",
    path: `/partner/enquiries/${ref}/documents`,
    body: { documents: enquiry.documents },
  });

  const finalised = await callPartner<{ status: string }>({
    method: "POST",
    path: `/partner/enquiries/${ref}/finalise`,
  });

  await prisma.enquiry.update({ where: { journeyId: ids.journeyId }, data: { status: "submitted" } });
  await logger.info("submitted", { partner_ref: created.body.partner_ref });

  // Arrows 10 and 11.
  await finish(201, { journey_id: ids.journeyId, cycle_id: ids.cycleId, status: finalised.body.status });
});
