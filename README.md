# Integration Triage Agent

An agent a developer points at a failing partner-API integration. It reads the monitored service's logs through an adapter, never writes into it, and returns **cause, evidence, and a proposed fix** as structured JSON.

Status: day 0. Build plan and concepts in `docs/STATE.md`.

## Stack
TypeScript, Express 5, Prisma on Postgres (pgvector image), Anthropic SDK with a hand-written agent loop. npm workspace: `packages/sandbox-middleware` (the Monitored Service stand-in), `packages/sandbox-upstream` (the Partner stand-in), `packages/sandbox-tests` (outer-edge suite). The Triage Service package arrives in step 1.

## Run the sandbox (step 0)
Needs Docker with Compose and Node 24.

```
cp .env.example .env          # defaults work as-is; edit to change ports or passwords
docker compose up -d --build  # Postgres (init SQL creates roles and databases), upstream, middleware (runs migrations, then serves)
curl -s localhost:3001/health ; curl -s localhost:3002/health
```

Run the outer-edge suite against the running stack (HTTP in, SQL out as `triage_ro`):

```
npm install
npm test
docker compose down -v        # stop and drop the data volume
```

To run a second stack beside the first (another worktree), change `COMPOSE_PROJECT_NAME`, `POSTGRES_PORT`, `UPSTREAM_PORT`, `MIDDLEWARE_PORT` and the matching `*_URL` values in that worktree's `.env`.

## Rules
- Read-only against the monitored service; replay only against the sandbox, behind an approval gate.
- No employer code, data, or credentials in this repo.
- The repo must run end to end at every commit.
