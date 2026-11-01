import express from "express";
import { config } from "./config.js";
import { runWithContext } from "./context.js";
import { enquiries, failPendingInbound } from "./enquiries.js";
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
// the enquiries handler turns them into 502 itself. An inbound Call Record the
// handler had already inserted must not stay pending with a null status.
app.use(async (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const body = { error: "INTERNAL_ERROR", message, request_id: res.getHeader("x-request-id") };
  try {
    await logger.error("unhandled error", { message });
    await failPendingInbound(500, body);
  } catch (writeErr) {
    process.stderr.write(`could not record the unhandled error: ${String(writeErr)}\n`);
  }
  res.status(500).json(body);
});

app.listen(config.port, () => {
  void logger.info("Sandbox Middleware listening", { port: config.port });
});
