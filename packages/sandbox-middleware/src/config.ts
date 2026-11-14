// All settings come from env (spec #1, Config). DATABASE_URL is read by Prisma itself.
export const config = {
  port: Number(process.env.PORT ?? 3001),
  partnerBaseUrl: process.env.PARTNER_BASE_URL ?? "http://localhost:3002",
  partnerToken: process.env.PARTNER_TOKEN ?? "sandbox-token-change-me",
  partnerTimeoutMs: Number(process.env.PARTNER_TIMEOUT_MS ?? 3000),
};
