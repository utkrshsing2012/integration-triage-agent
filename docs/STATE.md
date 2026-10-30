# State

**Phase:** 0, design grilled and recorded. Next: draw step 0, then spec it.

## Done (31 Oct 2026)
- Grill complete: 20 decisions in docs/TIMELINE.md, 4 ADRs in docs/decisions/, 20 terms in GLOSSARY.md.
- GitHub Issues tracker, triage labels, docs/agents/ configured.
- Working rule changed: agents draft, Utkarsh explains back before merge (CLAUDE.md). Gate built: /explain-back skill + merge hook + explained:N labels.
- Real middleware reviewed (reviewed locally, outside this repo): same stack, already has request/outbound log tables with request id and lead id.

## Next 3 tasks
1. Utkarsh draws step 0 from memory into docs/drawings/step-0.md (template provided). Claude checks it against the design.
2. `/to-spec` for step 0 (sandbox: Sandbox Middleware, Sandbox Upstream with 5 faults and admin switch, Postgres `sandbox` DB, Compose), then `/to-tickets`.
3. `/to-spec` for step 1 (RecordSource port + contract tests, 4 tools, workflow prefix + capped loop, structured-output report, CLI). Target for both: Sunday 2 Nov midday, agent time.

## Build plan (dates to re-cut in agent time at next wrap-up)
| # | Build | Concept |
|---|---|---|
| 0 | Sandbox: middleware + upstream + 5 faults + admin switch + Postgres + Compose | Fault injection as golden set |
| 1 | Port, contract tests, 4 tools, loop, structured report, CLI | Tool calling, ports and adapters |
| 2 | Tracing: runs/steps tables shaped as spans, cost | Observability |
| 3 | Evals: Cases, 4 scores, judge calibration, Sonnet vs Opus table | Evals |
| 4 | Memory: Resolutions in pgvector, search_past_resolutions | Retrieval |
| 5 | Guardrails: masking test, injection test, replay behind approval | Safety |
| 6 | Reliability: retries, timeouts, fallback model, budgets | Hardening |
| 7 | Ship: Compose on rented VM, demo, README | Shipping (30 Nov) |
| 8 | One measured improvement | Engineering loop (7 Dec) |
| 9 | Architecture doc, polling + write-back, second adapter | Senior signal (10 Dec) |

## Open questions
- Does structured output combine with tools on one request? Verify in step 1.
- December pilot needs from the company: read-only QA replica user, JSON logs on, approved model provider, PR review owner.
