-- The docker image creates cosmo_owner and the cosmo database from its environment variables.
-- Runs once when the local database is created.
-- cosmo_owner owns the tables and runs migrations.
-- cosmo_app is the user the running app connects with. It is not an administrator,
-- so row level security always applies to it (see docs/technical/04-security.md).
CREATE ROLE cosmo_app LOGIN PASSWORD 'cosmo_app';
CREATE DATABASE cosmo_test OWNER cosmo_owner;
