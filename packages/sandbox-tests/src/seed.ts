// Deterministic invented seed data for the Caller. Fixed seed, so Enquiry i
// is the same on every run and no value resembles a real person or partner.

// mulberry32: tiny seeded PRNG, enough for picking from lists.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = ["Asha", "Devika", "Kiran", "Meera", "Nikhil", "Rohan", "Sanya", "Tarun"];
const LAST_NAMES = ["Varma", "Pillai", "Nambiar", "Sethi", "Rao", "Bose", "Kaur", "Menon"];
const PRODUCTS = ["term-life-basic", "health-family-floater", "motor-comprehensive"];

// A tiny PDF-like byte blob: starts with the PDF header, ends with %%EOF.
// Not a valid PDF, just shaped like one; the sandbox never parses documents.
const TINY_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
  "utf8",
);

export interface EnquiryPayload {
  product: string;
  applicant: { full_name: string; date_of_birth: string; email: string; phone: string };
  sum_insured: number;
  documents: Array<{ name: string; content_type: string; content_base64: string }>;
}

export function seededEnquiry(index: number, seed = 20261101): EnquiryPayload {
  const rand = mulberry32(seed + index);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!;
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const year = 1970 + Math.floor(rand() * 30);
  const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(rand() * 28)).padStart(2, "0");
  const phone = `+91 90000 ${String(10000 + Math.floor(rand() * 89999))}`;
  return {
    product: pick(PRODUCTS),
    applicant: {
      full_name: `${first} ${last}`,
      date_of_birth: `${year}-${month}-${day}`,
      email: `${first}.${last}.${index}@example.invalid`.toLowerCase(),
      phone,
    },
    sum_insured: 500_000 * (1 + Math.floor(rand() * 10)),
    documents: [
      { name: "id-proof.pdf", content_type: "application/pdf", content_base64: TINY_PDF.toString("base64") },
    ],
  };
}

// The canonical caller_error payload: applicant.full_name missing.
export function callerErrorEnquiry(index: number): Omit<EnquiryPayload, "applicant"> & {
  applicant: Omit<EnquiryPayload["applicant"], "full_name">;
} {
  const { applicant, ...rest } = seededEnquiry(index);
  const { full_name: _dropped, ...applicantWithoutName } = applicant;
  return { ...rest, applicant: applicantWithoutName };
}
