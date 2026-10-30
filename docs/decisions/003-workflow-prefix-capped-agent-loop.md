# 003: Workflow prefix, then a capped agent loop

Status: accepted, 2026-10-31

## Context
Every triage run needs the same first two steps: resolve the developer's id to a Journey Id and fetch aggregates of the records. Only the investigation that follows is open-ended.

## Decision
Code performs the prefix deterministically with no model call. The model then enters a hand-written loop with four read-only tools and a hard cap on tool calls, and ends with a Triage Report enforced by structured outputs.

## Alternatives
- Pure agent: the model decides everything. Higher variance and cost on every run for steps that never vary.
- Pure workflow: a fixed fetch sequence and one classification call. Cheap and deterministic, but it can only find what the sequence fetches, so causes outside the five planted faults are unreachable.

## Consequences
- Lower cost and variance per run; the model starts with the histogram in context.
- Revisit toward pure workflow if step 3 evals show the loop rarely exceeds two calls after the prefix.
