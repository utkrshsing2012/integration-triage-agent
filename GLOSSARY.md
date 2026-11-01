# Integration Triage Agent

Triage of a failing integration between a middleware and the downstream partner it calls, from logs alone.

## Language

**Monitored Service**:
The middleware whose records the Triage Service reads. In the sandbox this role is played by the Sandbox Middleware.
_Avoid_: client, app, fake service, the real system's name

**Sandbox Middleware**:
The stand-in for a real middleware: accepts Enquirys, calls the Sandbox Upstream, and writes Log Lines and Call Records.
_Avoid_: fake service, fake middleware, mock client

**Partner**:
The downstream API the Monitored Service calls. In the sandbox this role is played by the Sandbox Upstream.
_Avoid_: insurer, vendor, fake partner

**Caller**:
The system that sends Enquiries to the Monitored Service. In the real system this is the quote system; in the sandbox the role is played by the eval harness's enquiry script, which also chooses the Fault for a run.
_Avoid_: client, user, quote system, harness

**Sandbox Upstream**:
The stand-in for a real Partner: an invented insurer-style API that answers the Sandbox Middleware's calls and plants a chosen Fault on command.
_Avoid_: fake partner, mock partner, stub

**Enquiry**:
One quote request flowing through the Monitored Service: structured data plus documents, forwarded to the Partner in one or more Cycles.
_Avoid_: quote submission, submission, request, upload, lead

**Call Record**:
One outbound or inbound HTTP exchange as the Monitored Service recorded it: when, which direction, method, URL, status, duration, bodies, error code, and the correlation id that ties it to a Enquiry.
_Avoid_: log entry, request log, audit row

**Log Line**:
One timestamped message the Monitored Service emitted, carrying a level and the correlation id of the Enquiry it belongs to.
_Avoid_: log entry, event, trace

**Fault**:
A deliberate, named failure planted in the sandbox Partner so the agent's answer can be checked against a known cause. Five exist: caller error, schema drift, rate limit, auth expired, upstream timeout.
_Avoid_: bug, error, scenario, disease

**Fingerprint**:
The distinct pattern a Fault leaves in Log Lines and Call Records, by which it can be told apart from every other Fault.
_Avoid_: signature, symptom

**Triage Service**:
The product: the agent that reads a Monitored Service's records and returns cause, evidence, fix, and confidence. It never writes to the Monitored Service.
_Avoid_: the agent, triage bot, our system

**Case**:
One frozen eval example: the masked Log Lines and Call Records the Triage Service saw, plus the expected cause. Replayable with no sandbox running.
_Avoid_: snapshot, fixture, cassette, scenario

**Request Id**:
The key shared by one inbound request to the Monitored Service and every outbound call it caused. Spans one hop.
_Avoid_: trace id, correlation id, transaction id

**Journey Id**:
The stable key shared by every record in the whole life of one Enquiry, across requests, background jobs, and resubmissions. In the real system this is the quotation number, which is one to one with the lead id.
_Avoid_: submission id, quotation number, lead id, business key

**Cycle Id**:
The key for one submission of an Enquiry to the Partner. One Enquiry has one Cycle in v1 and many once resubmissions exist. Maps to the real system's submission id.
_Avoid_: submission id, attempt, resubmission id

**Triage Report**:
The Triage Service's answer for one run: a cause with a class and an explanation, evidence that points at real records, a fix with the side responsible, and a confidence.
_Avoid_: result, diagnosis, output, verdict

**Evidence**:
One record the Triage Service cites in a Triage Report, by id, with an excerpt and a statement of what it proves.
_Avoid_: proof, citation, source, finding

**Port**:
An interface the Triage Service depends on for reading a Monitored Service, with no knowledge of which system is behind it.
_Avoid_: interface, abstraction, connector, plugin

**Adapter**:
One implementation of a Port for one real system, for example the sandbox database or a company's QA replica. The only place system-specific code lives.
_Avoid_: connector, integration, driver, plugin

**Run**:
One execution of the Triage Service for one input, from invocation to Triage Report, with its cost and duration.
_Avoid_: session, job, execution, trace

**Step**:
One model call or one tool call inside a Run, with its inputs, outputs, tokens, duration, and parent Step.
_Avoid_: span, event, call, action

**Golden Set**:
The collection of Cases with known expected causes that evals run against. Synthetic Cases come from the sandbox; real Cases come from human-labelled failures in a lower environment.
_Avoid_: test set, benchmark, fixtures, dataset

**Judge**:
A model, different from the one under test, that scores the free-text parts of a Triage Report against a per-Fault rubric, and whose scores are checked against a human's before being trusted.
_Avoid_: grader, evaluator, LLM-as-judge, scorer

**Resolution**:
A Triage Report a developer accepted as correct, stored so later Runs can find and cite it.
_Avoid_: memory, past case, history, precedent
