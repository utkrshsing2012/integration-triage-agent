import express from "express";
import { config } from "./config.js";
import { runWithContext } from "./context.js";
import { enquiries } from "./enquiries.js";
import { mintRequestId } from "./ids.js";
import { logger } from "./logger.js";

const app = express();
// Documents arrive as base64 inside the JSON body, so the default 100kb is too small.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "sandbox-middleware" });
});

// Every request gets a Request Id and runs inside its own context. The id is
// echoed as a header so a developer always has one to hand to the Triage Service.
app.use((req, res, next) => {
  const requestId = mintRequestId();
  res.setHeader("x-request-id", requestId);
  runWithContext({ requestId, journeyId: null, cycleId: null }, () => next());
});

app.use(enquiries);

// Last resort: anything not handled above. Upstream failures never reach here;
// the enquiries handler turns them into 502 itself.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  void logger.error("unhandled error", { message }).catch(() => undefined);
  res.status(500).json({ error: "INTERNAL_ERROR", request_id: res.getHeader("x-request-id") });
});

app.listen(config.port, () => {
  void logger.info("Sandbox Middleware listening", { port: config.port });
});
