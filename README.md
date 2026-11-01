# Integration Triage Agent

An agent a developer points at a failing partner-API integration. It reads the monitored service's logs through an adapter, never writes into it, and returns **cause, evidence, and a proposed fix** as structured JSON.

Status: step 0 (the sandbox) complete. Build plan and concepts in `docs/STATE.md`.

## Stack
TypeScript, Express 5, Prisma on Postgres (pgvector image), Anthropic SDK with a hand-written agent loop. npm workspace: `packages/sandbox-middleware` (the Monitored Service stand-in), `packages/sandbox-upstream` (the Partner stand-in), `packages/sandbox-tests` (outer-edge suite and the Caller script). The Triage Service package arrives in step 1.

## Two-minute demo (step 0)
Needs Docker with Compose and Node 24. After cloning, run `npm ci` once. Then three commands, from the repo root:

```
docker compose up -d --build
npx tsx packages/sandbox-tests/src/caller.ts --fault rate_limit_429 --count 1
docker compose exec postgres psql -U triage_ro -d sandbox -c "SELECT ts::time(3) AS at, direction, url, status, error_code, duration_ms FROM call_records WHERE journey_id = (SELECT journey_id FROM enquiries ORDER BY created_at DESC LIMIT 1) ORDER BY id;"
```

1. **Start the stack.** Postgres boots and its init SQL creates the `sandbox` and `triage` databases and the three roles; the Sandbox Upstream starts; the Sandbox Middleware waits for Postgres to be healthy, runs its migrations, then serves. Defaults need no env file (`.env.example` documents every knob). Check with `curl -s localhost:3001/health ; curl -s localhost:3002/health`.

2. **Run one Fault through the Caller.** The Caller plants `rate_limit_429` on the Sandbox Upstream's admin switch, sends one valid Enquiry to the Sandbox Middleware, prints one JSON line, and resets the switch to `none` on exit:

   ```
   {"journey_id":"QTN-2026-000004","status":502,"outcome":"upstream_failure","request_id":"718a2861-f848-4035-a94b-d3fa1c61edec"}
   ```

3. **Show the Fingerprint rows as `triage_ro`.** The read-only role reads the newest Journey's Call Records. One inbound 502, then four outbound 429s to create-enquiry a few milliseconds apart: the middleware retried instantly, ignoring `Retry-After: 30`.

   ```
         at      | direction |                  url                   | status |  error_code  | duration_ms
   --------------+-----------+----------------------------------------+--------+--------------+-------------
    13:56:44.697 | inbound   | /enquiries                             |    502 |              |          32
    13:56:44.718 | outbound  | http://upstream:3002/partner/enquiries |    429 | RATE_LIMITED |          11
    13:56:44.722 | outbound  | http://upstream:3002/partner/enquiries |    429 | RATE_LIMITED |           1
    13:56:44.724 | outbound  | http://upstream:3002/partner/enquiries |    429 | RATE_LIMITED |           1
    13:56:44.725 | outbound  | http://upstream:3002/partner/enquiries |    429 | RATE_LIMITED |           1
   (5 rows)
   ```

Swap `rate_limit_429` for any Fault below and rerun commands 2 and 3. Every value in the sandbox is invented (deterministic seed data in `packages/sandbox-tests/src/seed.ts`).

### Faults and Fingerprints
The five planted Faults and the pattern each leaves in `call_records` and `log_lines`, as drawn in `docs/drawings/step-0.md` (Failure points) and frozen as the eval answer key in spec issue [#1](https://github.com/utkrshsing2012/integration-triage-agent/issues/1) (user stories 22 to 26, Further Notes).

- **caller_error** (sent by the Caller, no admin switch): an inbound 400 with no upstream call at all; zero outbound Call Records for that Request Id, a warn Log Line, no `enquiries` row.
- **schema_drift**: one outbound 400 whose body names an unknown field (`nominee_relationship`), on every Journey after the switch; the Caller sees 502.
- **rate_limit_429**: repeated 429s under one Request Id with gaps far below `Retry-After`; four Call Records (one call plus three instant retries), the Caller sees 502.
- **auth_expired**: 401 `TOKEN_EXPIRED` on every outbound call across all Journeys after the switch, nothing Journey-specific; no retry, the Caller sees 502.
- **upstream_timeout**: one outbound Call Record with status null, `error_code` `ETIMEDOUT`, no response body, `duration_ms` pinned at the client timeout (`PARTNER_TIMEOUT_MS`, default 3000); the Caller sees 502 "upstream timed out".

### Run the outer-edge suite
Against the running stack, HTTP in and SQL out as `triage_ro` (clean path, five Faults, read-only guarantee, correlation, admin switch, Caller script):

```
npm test
docker compose down -v        # stop and drop the data volume
```

Two of the test files restart one container with `docker compose` (`PARTNER_FAULT`, `PARTNER_TIMEOUT_MS`), so the whole run takes a little over a minute (12 files, 86 tests).

To run a second stack beside the first (another worktree), copy `.env.example` to `.env` there and change `COMPOSE_PROJECT_NAME`, `POSTGRES_PORT`, `UPSTREAM_PORT`, `MIDDLEWARE_PORT` and the matching `*_URL` values.

## Rules
- Read-only against the monitored service; replay only against the sandbox, behind an approval gate.
- No employer code, data, or credentials in this repo.
- The repo must run end to end at every commit.
