# 004: Postgres with two databases and engine-enforced read-only access

Status: accepted, 2026-10-31. Supersedes the SQLite choice in the original CLAUDE.md.

## Context
Two processes write records (the Sandbox Middleware and the Triage Service), the pilot target runs Postgres, step 4 wants vector search, and the read-only rule must be provable.

## Decision
One Postgres container with pgvector, two databases: `sandbox`, written only by the Sandbox Middleware, and `triage`, written only by the Triage Service. The Triage Service connects to `sandbox` with a SELECT-only user. Prisma is the data layer because the real middleware uses it and the schema file is the adapter's shared contract.

## Alternatives
- SQLite: zero setup, but a single-writer file shared across containers is its weak spot, it has no per-user permissions, and the pilot target is Postgres anyway.
- Two Postgres containers: cleaner isolation, double the operational surface for no demo benefit.

## Consequences
- Read-only is enforced by the engine, not by convention, and can be demonstrated.
- Compose needs a healthcheck-gated startup order.
- Utkarsh builds depth in one database rather than breadth in two.
