-- Three roles, two databases.
--   sandbox_app  owns `sandbox`; the Sandbox Middleware connects and migrates as this role.
--   triage_app   owns `triage`; the Triage Service (step 1+) connects as this role.
--   triage_ro    reads `sandbox` and nothing else. Read-only is enforced by the engine.
CREATE ROLE sandbox_app LOGIN PASSWORD :'sandbox_app_password';
CREATE ROLE triage_app  LOGIN PASSWORD :'triage_app_password';
CREATE ROLE triage_ro   LOGIN PASSWORD :'triage_ro_password';

CREATE DATABASE sandbox OWNER sandbox_app;
CREATE DATABASE triage  OWNER triage_app;

-- Nobody connects to either database by accident; connect rights are explicit.
REVOKE ALL ON DATABASE sandbox FROM PUBLIC;
REVOKE ALL ON DATABASE triage  FROM PUBLIC;
GRANT CONNECT ON DATABASE sandbox TO triage_ro;
