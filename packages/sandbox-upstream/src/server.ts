import express from "express";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3002);
const PARTNER_TOKEN = process.env.PARTNER_TOKEN ?? "sandbox-token-change-me";

const app = express();
// Documents arrive as base64 inside the JSON body, so the default 100kb is too small.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "sandbox-upstream" });
});

// Static bearer check on the three business endpoints. UNAUTHORISED is
// deliberately a different code from TOKEN_EXPIRED (the auth_expired Fault, #6).
const partner = express.Router();
partner.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${PARTNER_TOKEN}`) {
    res.status(401).json({ code: "UNAUTHORISED", message: "Bearer token missing or not recognised" });
    return;
  }
  next();
});

// #4 adds here one middleware that dispatches on the current Fault through a
// table keyed by Fault name, before the business routes below.

// create-enquiry: returns a partner enquiry ref. Stateless: the ref is not stored.
partner.post("/enquiries", (_req, res) => {
  res.status(200).json({ partner_ref: `PRT-${randomBytes(4).toString("hex").toUpperCase()}` });
});

// upload-documents: accepts base64 documents under the ref.
partner.post("/enquiries/:ref/documents", (req, res) => {
  const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];
  res.status(200).json({ partner_ref: req.params.ref, documents_received: documents.length });
});

// finalise-submission: nothing beyond the ref.
partner.post("/enquiries/:ref/finalise", (req, res) => {
  res.status(200).json({ partner_ref: req.params.ref, status: "submitted" });
});

app.use("/partner", partner);

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", message: "Sandbox Upstream listening", port: PORT }));
});
