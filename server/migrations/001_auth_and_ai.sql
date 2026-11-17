CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  email_verified_at timestamptz,
  auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0),
  ai_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE password_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE refresh_tokens (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens(session_id);
CREATE TABLE action_tokens (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX action_tokens_user_idx ON action_tokens(user_id, purpose);
CREATE TABLE rate_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);
CREATE TABLE ai_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT '',
  input_microusd_per_million bigint NOT NULL DEFAULT 0 CHECK (input_microusd_per_million >= 0),
  output_microusd_per_million bigint NOT NULL DEFAULT 0 CHECK (output_microusd_per_million >= 0),
  daily_budget_microusd bigint NOT NULL DEFAULT 1000000 CHECK (daily_budget_microusd > 0),
  monthly_budget_microusd bigint NOT NULL DEFAULT 10000000 CHECK (monthly_budget_microusd > 0),
  user_daily_requests integer NOT NULL DEFAULT 10 CHECK (user_daily_requests > 0),
  user_daily_tokens integer NOT NULL DEFAULT 500000 CHECK (user_daily_tokens > 0),
  max_concurrency integer NOT NULL DEFAULT 2 CHECK (max_concurrency BETWEEN 1 AND 100),
  max_output_tokens integer NOT NULL DEFAULT 12000 CHECK (max_output_tokens BETWEEN 1 AND 12000)
);
INSERT INTO ai_policy(singleton) VALUES (true);
CREATE TABLE ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  model text NOT NULL,
  task text NOT NULL DEFAULT 'cleanup' CHECK (task IN ('cleanup', 'guard')),
  state text NOT NULL CHECK (state IN ('running', 'succeeded', 'failed', 'unknown', 'cancelled')),
  reserved_input_tokens integer NOT NULL CHECK (reserved_input_tokens >= 0),
  reserved_output_tokens integer NOT NULL CHECK (reserved_output_tokens >= 0),
  charged_tokens integer NOT NULL CHECK (charged_tokens >= 0),
  input_rate bigint NOT NULL,
  output_rate bigint NOT NULL,
  reserved_microusd bigint NOT NULL CHECK (reserved_microusd >= 0),
  charged_microusd bigint NOT NULL CHECK (charged_microusd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX ai_requests_user_date_idx ON ai_requests(user_id, created_at);
CREATE INDEX ai_requests_date_idx ON ai_requests(created_at);
CREATE INDEX ai_requests_active_idx ON ai_requests(lease_until) WHERE state = 'running';
