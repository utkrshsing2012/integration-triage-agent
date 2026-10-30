# Learning log

Concepts covered, quiz grades (1–5), and mistakes worth remembering. Appended at each wrap-up.

## 2026-10-31: design grill
Concepts: ports and adapters (hexagonal), correlation id vs business key, fault taxonomy with fingerprints, test double with a control plane, record and replay (Cases), workflow vs agent, structured outputs vs tool-as-output, span-shaped traces, deterministic scoring before judge scoring, confidence calibration, one artifact many environments.
Quiz: "50,000 log lines in 10 minutes, agent gets worse: what and three fixes?" Grade 2/5. Answered chunking; wanted aggregate first, filter server-side second, cap with a teaching truncation marker third. Principle: push counting and filtering to the database, keep reasoning in the model.
Mistake worth remembering: I (Claude) mapped the journey key to lead id; Utkarsh corrected it to quotation number (lead id changes per resubmission). Domain facts come from him, not from code reading alone.
