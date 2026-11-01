# Build context is the repo root so the workspace lockfile is available.
FROM node:24-slim AS build
WORKDIR /app
# Prisma engines need openssl; node:*-slim ships without it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sandbox-middleware/package.json packages/sandbox-middleware/
RUN npm ci --workspace=sandbox-middleware --include-workspace-root=false
COPY packages/sandbox-middleware packages/sandbox-middleware
RUN npx prisma generate --schema packages/sandbox-middleware/prisma/schema.prisma \
 && npm run build -w sandbox-middleware

FROM node:24-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/sandbox-middleware/package.json packages/sandbox-middleware/
COPY --from=build /app/packages/sandbox-middleware/prisma packages/sandbox-middleware/prisma
COPY --from=build /app/packages/sandbox-middleware/dist packages/sandbox-middleware/dist
WORKDIR /app/packages/sandbox-middleware
# Migrations run as sandbox_app (DATABASE_URL) on every start, then the server comes up.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
