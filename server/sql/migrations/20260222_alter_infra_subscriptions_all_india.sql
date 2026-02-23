ALTER TABLE infra_subscriptions
  ALTER COLUMN state DROP DEFAULT,
  ALTER COLUMN district DROP DEFAULT;

ALTER TABLE infra_subscriptions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_subs_unsub_token
  ON infra_subscriptions (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;
