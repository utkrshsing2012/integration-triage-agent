# How the Triage Service plugs into a real middleware

One page that gathers decisions already made (TIMELINE rows dated 2026-10-31, ADR 001, ADR 002, ADR 004) so the plug-in path is findable in one place. Nothing here is new design.

## What ships
One container image, built from the `triage` package alone (arrives in step 1). It contains the agent loop, the tools, the `RecordSource` port, and the adapters. It contains nothing from `sandbox-upstream`, `sandbox-middleware`, or `sandbox-tests`; those three stay on the laptop as the training ground and the demo.

## What the host system must provide
1. A Postgres role with SELECT only on the tables the adapter reads (the same shape as `db/init/sql/02-sandbox-read-only.sql`), on a lower environment, never production (ADR 002).
2. Network reach from the Triage Service container to that database.
3. Structured JSON log lines carrying the request id and the journey-level id (the real middleware already logs this way; TIMELINE 2026-10-31).
4. One service block in the host's Compose file, pointing at the same image as the demo (TIMELINE 2026-10-31, company QA runs Compose).

## What we provide
- The `RecordSource` port: `callRecords(journeyId)`, `logLines(journeyId)`, `resolveJourney(anyId)`, `journeysSince(window)`. Returns Call Records and Log Lines only; no endpoint names, no table names leak through it (ADR 001).
- Two adapters behind it, selected by env `RECORD_SOURCE`:
  - `sandbox`: reads `call_records`, `log_lines`, `enquiries` as `triage_ro`. Built in step 1.
  - `pilot`: reads the real middleware's two request-log tables (inbound API log and outbound request log) and maps them into the one Call Record shape with a `direction` column; resolves quotation number, lead id, or submission id to the Journey Id through its enquiry and resubmission-cycle tables. Lives as a private package outside this repo (TIMELINE 2026-10-31 Goal row); its interface and its contract tests live here.
- Masking inside every adapter before any record reaches the model (ADR 002).
- A contract test suite that every adapter must pass. Its seed is the step 0 outer-edge suite: the same Fingerprint assertions, run through the port instead of raw SQL.

## Mapping, real middleware to Call Record
| Call Record field | inbound API log | outbound request log |
|---|---|---|
| direction | `inbound` | `outbound` |
| method, url, status, duration_ms | same-named columns | same-named columns |
| request_body, response_body | masked at read time | masked at read time |
| error_code | derived from status and body code | provider error code column |
| request_id | request id column | request id column |
| journey_id | lead id resolved to quotation number | lead id resolved to quotation number |
| cycle_id | null | submission id |

Column names on the right are confirmed against the real schema during pilot prep; this table is the contract the adapter must satisfy.

## Sequence
1. Steps 1 to 7 here, against the sandbox (deadline 30 Nov).
2. Pilot prep in the company repo: read-only QA role, Compose service block, the `pilot` adapter package, contract tests green against a QA copy.
3. First pilot run on a known past failure in QA; compare the Triage Report with what the team found by hand.

## Why not separate repos now
The sandbox is the eval fixture for the Triage Service: the record schema, the glossary, the contract tests and the Cases all cross the boundary between them. In one repo they version together and one clone runs the whole demo. The deployable unit is still one package with its own Dockerfile and no imports from the sandbox packages, enforced by a test from step 1 on. Extracting that package into its own repo later is one `git subtree split`, because the boundary is already a package boundary.
