# Integration Triage Agent

An agent a developer points at a failing partner-API integration. It reads the monitored service's logs through an adapter, never writes into it, and returns **cause, evidence, and a proposed fix** as structured JSON.

Status: day 0. Build plan and concepts in `docs/STATE.md`.

## Planned stack
TypeScript, Express, Prisma on SQLite, Anthropic SDK with a hand-written agent loop. Two Docker containers: a fake partner app with fault injection, and the triage service.

## Rules
- Read-only against the monitored service; replay only against the sandbox, behind an approval gate.
- No employer code, data, or credentials in this repo.
- The repo must run end to end at every commit.
