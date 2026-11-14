# State

**Phase:** Step 0 (sandbox) built and merged. Next: step 1, the agent.

## Done
- 31 Oct: design grill: 20 decisions in docs/TIMELINE.md, 4 ADRs in docs/decisions/, GLOSSARY.md.
- 1 Nov: step 0 sandbox: middleware, upstream with 5 Faults and admin switch, Postgres with read-only role, Compose. Outer-edge suite 87 tests green. Reviewed and fixed (PR #9).
- 2 Nov: docs/PILOT.md, how the Triage Service plugs into a real middleware.
- 14 Nov: process loosened (explain-back merge gate, draw-before-spec and teach-before-build removed; default flow is `/dev`).

## Next 3 tasks
1. `/dev` step 1: RecordSource port + contract tests, 4 read-only tools, workflow prefix + capped loop, structured Triage Report, CLI. Utkarsh writes the system prompt.
2. `/dev` step 3: evals over the 5 Faults (cause accuracy, evidence validity, judge for fix quality), Sonnet vs Opus cost table. Utkarsh writes the rubric.
3. `/dev` step 7: deploy demo + README with results.

## Build plan (trimmed 14 Nov for January interviews)
| # | Build | Concept | Status |
|---|---|---|---|
| 0 | Sandbox with 5 Faults | Fault injection as golden set | Done |
| 1 | Port, tools, loop, structured report, CLI | Tool calling, ports and adapters | Next |
| 3 | Evals + model comparison | Evals | Core |
| 5 | Guardrails: masking, prompt-injection test | Safety | Core |
| 7 | Ship: Compose on a VM, demo, README | Shipping | Core |
| 2, 4, 6, 8, 9 | Tracing, memory, hardening, improvement loop, architecture doc | | Only if time allows |

## Open questions
- Does structured output combine with tools on one request? Verify in step 1.
- Pilot needs from the company: read-only QA replica user, JSON logs on, approved model provider, PR review owner.
