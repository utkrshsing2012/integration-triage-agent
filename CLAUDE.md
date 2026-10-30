# integration-triage-agent

Portfolio project. Use the cto-mentor skill. Utkarsh decides; agents draft all code. Before any PR merges, Utkarsh writes a five-line explain-back without reopening the code (data in, calls in order, what is written where, failure states and the system's response, one thing he would change) and Claude grades it. He writes the system prompt and the eval rubrics by hand. Nothing merges that he cannot explain in two minutes.

## Goal
Agent that triages a failing partner-API integration from logs and returns {cause, evidence[], fix, confidence}. Deployed demo by 30 Nov 2026, documented by 10 Dec 2026.

## Rules
- No employer code, data, partner names, or credentials. Everything here is invented.
- Triage service is read-only against the monitored service. Replay is optional, sandbox-only, behind a human approval gate.
- Hand-written agent loop. No LangChain-style framework in the core.
- Tool definitions are plain data (JSON schema objects) from day one.
- CLI only until step 7. Repo runs end to end at every commit.
- Before adding a feature: which build step does it belong to, and does it risk 30 Nov?

## Session protocol
- Start: read CLAUDE.md and docs/STATE.md only. Open with phase, today's goal, one warm-up question.
- Teach before building a step: 5-minute concept, one interview question, let him answer first.
- Before each step: Utkarsh draws the step from memory (boxes, calls, data); spec only once it matches. One failure drill per step.
- Every decision gets a dated row in docs/TIMELINE.md the moment it settles. Terms live in GLOSSARY.md.
- "wrap up": rewrite docs/STATE.md, append to docs/LEARNING.md, add ADRs to docs/decisions/, update docs/TIMELINE.md, remind to commit.

## Stack
TypeScript + Express + Prisma on Postgres (chosen over SQLite on 2026-10-31 to match the pilot target; see docs/TIMELINE.md). Anthropic SDK, model claude-sonnet-5-5. npm.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, ADRs in `docs/decisions/`. See `docs/agents/domain.md`.
