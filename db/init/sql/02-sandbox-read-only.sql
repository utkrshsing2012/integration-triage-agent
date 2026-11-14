-- triage_ro: CONNECT (granted above), USAGE on schema public, SELECT on every
-- current table, and SELECT on every table sandbox_app creates later.
\connect sandbox

GRANT USAGE ON SCHEMA public TO triage_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO triage_ro;

-- Prisma migrations run as sandbox_app and create the tables after this script,
-- so the default privileges must be declared FOR ROLE sandbox_app.
ALTER DEFAULT PRIVILEGES FOR ROLE sandbox_app IN SCHEMA public
  GRANT SELECT ON TABLES TO triage_ro;
