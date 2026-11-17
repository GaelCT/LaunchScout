-- Run as the schema owner after migration. Set the login password separately with psql \password.
-- This example is intentionally not auto-run by the application.
CREATE ROLE launchscout_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT CONNECT ON DATABASE launchscout TO launchscout_app;
GRANT USAGE ON SCHEMA public TO launchscout_app;
GRANT SELECT ON schema_migrations TO launchscout_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, password_credentials, auth_sessions,
  refresh_tokens, action_tokens, rate_limits, ai_policy, ai_requests TO launchscout_app;
