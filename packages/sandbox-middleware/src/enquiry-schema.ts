// The Enquiry payload. This Zod schema is the single source of mandatory
// fields; a missing applicant.full_name is the canonical caller_error.
import { z } from "zod";

export const EnquirySchema = z.object({
  product: z.string().min(1),
  applicant: z.object({
    full_name: z.string().min(1),
    date_of_birth: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
  }),
  sum_insured: z.number().positive(),
  documents: z
    .array(
      z.object({
        name: z.string().min(1),
        content_type: z.string().min(1),
        content_base64: z.string().min(1),
      }),
    )
    .min(1),
});

export type Enquiry = z.infer<typeof EnquirySchema>;
