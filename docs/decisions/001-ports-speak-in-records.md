# 001: Ports speak in records, never in partner endpoints

Status: accepted, 2026-10-31

## Context
The Triage Service must plug into any HTTP integration, starting with an invented sandbox and later a real middleware in a company QA environment. If the agent's code knew about specific endpoints (create-enquiry, finalise), every new system would need agent changes.

## Decision
The agent depends on one port, `RecordSource`, whose methods return two generic record types: Log Line and Call Record. Each carries a Request Id (one hop) and a Journey Id (whole Enquiry). Partner endpoints, table names, and id types live only in adapters. A contract test suite must pass against every adapter.

## Alternatives
- Agent queries the monitored database directly with SQL: maximum flexibility, zero pluggability, injection and cost risk.
- One adapter per partner with partner-specific tools: more precise prompts, but the agent core changes per system.

## Consequences
- Plugging into the real middleware is writing one adapter and passing the contract tests.
- Non-HTTP sources (queues) need a third record type later; the port is designed with a record type field so that is additive.
- The fault vocabulary is HTTP-flavoured in v1.
