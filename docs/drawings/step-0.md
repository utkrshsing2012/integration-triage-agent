# Step 0: Sandbox

Reference drawing written by Claude from docs/TIMELINE.md, docs/decisions/, GLOSSARY.md on 31 Oct 2026, after two attempts from memory stayed at product level (see step-0.attempt-1.md). Utkarsh redraws Boxes and Arrows from memory before /to-spec.

Step 0 contains no agent. It is the world the agent will read in step 1.

## Boxes
One line per process or store. Who owns it, what it holds.

- **Caller** (eval harness, in step 0 a script or curl). Plays the quote system that calls the real middleware. Sends Enquiries, reads the reply. Holds nothing.
- **Sandbox Middleware** (Express 5, Zod, Prisma, TS). Stand-in for the Monitored Service. Accepts an Enquiry, validates it, calls the Sandbox Upstream three times in order, writes every record. Sole writer of database `sandbox`. Mirrors the real middleware's weak spots on purpose: static bearer token never refreshed, fixed client timeout, instant retries with no backoff.
- **Sandbox Upstream** (Express, stateless). Stand-in for the Partner, invented insurer-style API. Three business endpoints plus one admin endpoint. Holds exactly one thing in memory: the current Fault, initial value from env `PARTNER_FAULT`, changed at runtime by `POST /__admin/fault`.
- **Postgres** (pgvector image, one container). Two databases: `sandbox` (owner: the middleware's user; a second user `triage_ro` with SELECT only, created by init SQL in step 0 so step 1 only connects) and `triage` (owner: Triage Service, empty in step 0).
- **Docker Compose**. Wires the three containers (middleware, upstream, postgres). Postgres healthcheck gates middleware startup. Same compose file moves to the rented VM in step 7.

Not in step 0: Triage Service, tools, model, evals, Cases.

## Arrows
One line per call or write, in the order they happen on a normal run (no Fault switched on).
Format: `FROM -> TO : call or action : data it carries`

1. Caller -> Sandbox Middleware : POST /enquiries : applicant data + documents as base64. Middleware mints request_id, journey_id (plays the quotation number), cycle_id (plays the submission id).
2. Sandbox Middleware -> `sandbox` DB : INSERT call_records (direction inbound) : method, url, status pending, request body, the three ids.
3. Sandbox Middleware -> `sandbox` DB and stdout : INSERT log_lines "enquiry received" : level info, the three ids. Every log line from here on is also printed as one JSON line on stdout.
4. Sandbox Middleware -> Sandbox Upstream : POST /partner/enquiries (create-enquiry) : Bearer token, applicant data. Reply: partner enquiry ref.
5. Sandbox Middleware -> `sandbox` DB : INSERT call_records (outbound) : method, url, status 200, duration_ms, request and response bodies, the three ids.
6. Sandbox Middleware -> Sandbox Upstream : POST /partner/enquiries/{ref}/documents (upload-documents) : documents as base64. Reply: 200.
7. Sandbox Middleware -> `sandbox` DB : INSERT call_records (outbound) : as in 5.
8. Sandbox Middleware -> Sandbox Upstream : POST /partner/enquiries/{ref}/finalise (finalise-submission) : nothing beyond the ref. Reply: 200 {status: submitted}.
9. Sandbox Middleware -> `sandbox` DB : INSERT call_records (outbound) : as in 5, plus log_lines "submitted".
10. Sandbox Middleware -> `sandbox` DB : UPDATE the inbound call_record from step 2 : status 201, duration_ms, response body.
11. Sandbox Middleware -> Caller : 201 : {journey_id, cycle_id, status: submitted}.

Out of band, control plane only:
- Eval harness -> Sandbox Upstream : POST /__admin/fault {fault: <one of five> | none} : before a run. The Triage Service never calls this.

## Where records land
Which table or file each box writes, with the fields that matter for triage.

- `sandbox.call_records` (written only by Sandbox Middleware): id, ts, direction (inbound | outbound), method, url, status (null when no response), duration_ms, request_body, response_body, error_code (e.g. TOKEN_EXPIRED, ETIMEDOUT), request_id, journey_id, cycle_id. Shape mirrors the real middleware's api_request_logs and outbound_request_logs.
- `sandbox.log_lines` (written only by Sandbox Middleware): id, ts, level, message, context JSON, request_id, journey_id, cycle_id.
- stdout of Sandbox Middleware: the same log lines as JSON, one per line, for humans and `docker compose logs`.
- Sandbox Upstream writes nothing. Its only state is the current Fault in memory; a restart resets it to `PARTNER_FAULT`.
- `triage` database: exists, empty. Step 2 adds runs and steps.
- Records in `sandbox` are unmasked. All data is invented. Masking happens in the adapter in step 1, not here.

## Failure points
One line per thing that can fail, what the caller sees, what gets recorded. The first five are the planted Faults; their fingerprints are the eval answer key.

- **caller_error**: Caller sends a malformed Enquiry (mandatory field missing). Caller sees 400 from the middleware with the Zod error. Recorded: inbound call_record 400, log_line warn, zero outbound call_records for that request_id. Fingerprint: a 400 with no upstream call at all.
- **schema_drift**: Upstream answers create-enquiry with 400 naming a field the middleware never sends. Caller sees 502 from the middleware. Recorded: one outbound call_record 400 whose response_body names the new required field. Fingerprint: outbound 400, body names an unknown field, every journey after the switch.
- **rate_limit_429**: Upstream answers 429 with Retry-After. Middleware retries instantly with no backoff until its retry cap. Caller sees 502. Recorded: a burst of 429 call_records milliseconds apart under one request_id. Fingerprint: repeated 429s, gaps far below Retry-After.
- **auth_expired**: Upstream answers 401 with error_code TOKEN_EXPIRED. Middleware never refreshes the static token. Caller sees 502. Recorded: 401 call_records with that error_code on every outbound call, across all journeys after the switch. Fingerprint: 401 TOKEN_EXPIRED everywhere, nothing journey-specific.
- **upstream_timeout**: Upstream goes silent past the middleware's client timeout. Caller sees 502 "upstream timed out". Recorded: outbound call_record with status null, duration_ms equal to the timeout, error_code ETIMEDOUT, no response_body. Fingerprint: duration pinned at the timeout value, no response.
- Postgres not ready: middleware container waits on the healthcheck, nothing recorded.
- Upstream container down: outbound call_record with error_code ECONNREFUSED. Not a planted Fault; the agent should class it as other.

## One thing I am unsure about
- Resolved 31 Oct in /to-spec: lead id lives in a third table `enquiries` (journey_id, lead_id, cycle ids, status). Q5 amended to three tables.
- Resolved 31 Oct in /to-spec: inbound and outbound share `call_records` with a direction column.
- Resolved 31 Oct in /to-spec: caller_error comes from the Caller script, not the admin switch.
