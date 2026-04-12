ALTER TABLE users
  ADD COLUMN IF NOT EXISTS managed_auth_provider VARCHAR(40),
  ADD COLUMN IF NOT EXISTS managed_auth_subject VARCHAR(255),
  ADD COLUMN IF NOT EXISTS managed_auth_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS managed_auth_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS managed_auth_last_sign_in_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_managed_auth_identity_unique
  ON users (managed_auth_provider, managed_auth_subject)
  WHERE managed_auth_provider IS NOT NULL
    AND managed_auth_subject IS NOT NULL;
