CREATE TABLE IF NOT EXISTS infra_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  state VARCHAR(80) NOT NULL,
  district VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('WHATSAPP', 'EMAIL')),
  contact VARCHAR(200) NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribe_token TEXT,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infra_subs_city
  ON infra_subscriptions (state, district, city);

CREATE INDEX IF NOT EXISTS idx_infra_subs_active_created
  ON infra_subscriptions (is_active, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_subs_unsub_token
  ON infra_subscriptions (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS infra_ingest_items (
  id BIGSERIAL PRIMARY KEY,
  source_key VARCHAR(80) NOT NULL,
  item_guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  summary TEXT,
  raw JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'IGNORED', 'PUBLISHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key, item_guid)
);

CREATE INDEX IF NOT EXISTS idx_ingest_status_created
  ON infra_ingest_items (status, created_at DESC);
