# Step 0: Sandbox. Attempt 1 from memory (Utkarsh, 31 Oct 2026)

Kept verbatim for comparison. Company system name replaced with "the real middleware" (public repo rule).

## Arrows (as written)

1. User enters a unique identifier key for a system where our triage agent is plugged. Taking the example of the real middleware, the user might enter Quotation Number (known by partner system, middleware, AI system) or lead id (known by partner system and middleware) or submission id (known by all, but has 1:many relation with quotation number, meaning one quotation number can have multiple submission ids) or a time interval in which the user wants to check what all went wrong.
2. We use the identifier key or time interval to fetch relevant logs from the middleware system (the system we plug our triage agent to), as the rest are external systems. We remove the noise and the same logs which are repeated, so if we have a failure at 10:01:00 AM and we retry every minute, then if the failure persisted we take the time first appeared and time last appeared, and number of tries too maybe, and give to the agent in context.
3. The agent will check the request response structure, mandatory fields, timeouts, and provide the root cause. We will have 5 tools, which I don't exactly remember, so that the system works in a deterministic way, same mandatory and common initial steps are done deterministically.
4. The agent will read the root cause and devise the best, scalable, maintainable fix following coding standards through first principles, and forward the fix to the user.
5. Now we have evals also in this, but I don't know how exactly evals would work.

## What Claude found (31 Oct)
- Zoom level: this describes steps 1 and 3 (the agent and evals). Step 0 has no agent in it.
- Boxes, records, failure points: empty. These are the whole of step 0.
- Point 2 is the workflow prefix and the aggregate mode of the list tools (Q10, Q11). Right instinct, wrong step.
- Point 3: four tools in step 1, fifth (search_past_resolutions) in step 4.
- Point 4: the Triage Report carries a fix as summary, steps, side. The agent writes no code.
