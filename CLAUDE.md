# integration-triage-agent

Portfolio project. Utkarsh decides; agents draft the code. He writes the agent's system prompt and the eval rubrics by hand, and must be able to explain every merged change in two minutes.

## Goal
Agent that triages a failing partner-API integration from logs and returns {cause, evidence[], fix, confidence}. Deployed demo, then documented. Dates live in docs/STATE.md.

## Rules
- No employer code, data, partner names, or credentials. Everything here is invented.
- Triage service is read-only against the monitored service. Replay is optional, sandbox-only, behind a human approval gate.
- Hand-written agent loop. No LangChain-style framework in the core.
- Tool definitions are plain data (JSON schema objects) from day one.
- CLI only until the ship step. Repo runs end to end at every commit.
- Before adding a feature: which build step does it belong to, and does it risk the ship date?

## How we work
- Default flow is `/dev` (global skill): plan in `.scratch/<feature>/plan.md`, "go", build every slice test-first, commit each. Use the heavy Matt Pocock flow (GitHub issues) only for foggy work.
- Learning happens after building, not as a gate: each `/dev` report has why-lines; `/wrap-up` adds an interview question to docs/LEARNING.md; `/quiz-me` drills it. `/explain-back <pr>` is optional practice, not required to merge.
- Docs to keep current: docs/STATE.md (phase, next tasks), docs/LEARNING.md, an ADR in docs/decisions/ only for hard-to-reverse choices, GLOSSARY.md when a new domain term appears. docs/TIMELINE.md is history; add a row only for major decisions.

## Commands
- `colima start` first (container runtime), then `docker compose up -d`.
- `npm test` (outer-edge suite, needs the Compose stack), `npm run typecheck`, `npm run build`.

## Stack
TypeScript + Express + Prisma on Postgres (chosen over SQLite on 2026-10-31 to match the pilot target; see docs/TIMELINE.md). Anthropic SDK, model claude-sonnet-5-5. npm.

## Agent skills (heavy flow only)

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, ADRs in `docs/decisions/`. See `docs/agents/domain.md`.
