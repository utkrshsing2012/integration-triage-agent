// Every Log Line goes to stdout as one JSON object and to `log_lines`, in one
// call, carrying the three ids from request context automatically.
import type { Prisma } from "@prisma/client";
import { contextIds } from "./context.js";
import { prisma } from "./db.js";

export type LogLevel = "info" | "warn" | "error";

export async function log(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
  const ids = contextIds();
  const ts = new Date();
  process.stdout.write(
    JSON.stringify({
      ts: ts.toISOString(),
      level,
      message,
      request_id: ids.requestId,
      journey_id: ids.journeyId,
      cycle_id: ids.cycleId,
      ...(context ? { context } : {}),
    }) + "\n",
  );
  await prisma.logLine.create({
    data: {
      ts,
      level,
      message,
      context: (context ?? undefined) as Prisma.InputJsonValue | undefined,
      requestId: ids.requestId,
      journeyId: ids.journeyId,
      cycleId: ids.cycleId,
    },
  });
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
