# 002: Live read-only reads for triage, masked Cases for evals and production hand-off

Status: accepted, 2026-10-31

## Context
Company rules forbid any agent from touching production. Triage needs current records during an incident, evals need frozen inputs, and production failures still need a path to the agent.

## Decision
The Triage Service reads the Monitored Service live through a SELECT-only database user, masking inside the adapter before anything reaches the model. The eval harness freezes the records a run fetched into a masked Case file. Production failures enter as a Case exported by a named person using a masking script. A replica-read path is designed in but disabled until leadership approves it after the QA pilot produces numbers.

## Alternatives
- Snapshot everything into the triage database first: immutable evidence, but copies partner response bodies that may hold personal data into a second store, and goes stale mid-incident.
- Read-only user on a production replica from day one: how commercial tools work, but it is exactly what the current company rule forbids.

## Consequences
- The compliance story is one sentence: read-only user, masked at the boundary, nothing unmasked stored.
- Case format is a versioned public JSON schema; the export script targets it from the company repo.
- Enabling replica reads later is a policy decision plus one environment variable, not a redesign.
