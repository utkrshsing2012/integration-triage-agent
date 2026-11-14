# Build context is the repo root so the workspace lockfile is available.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sandbox-upstream/package.json packages/sandbox-upstream/
RUN npm ci --workspace=sandbox-upstream --include-workspace-root=false
COPY packages/sandbox-upstream packages/sandbox-upstream
RUN npm run build -w sandbox-upstream

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/sandbox-upstream/package.json packages/sandbox-upstream/
COPY --from=build /app/packages/sandbox-upstream/dist packages/sandbox-upstream/dist
WORKDIR /app/packages/sandbox-upstream
CMD ["node", "dist/server.js"]
