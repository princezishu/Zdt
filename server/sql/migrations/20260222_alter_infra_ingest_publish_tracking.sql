ALTER TABLE infra_ingest_items
  ADD COLUMN IF NOT EXISTS published_update_id BIGINT;

ALTER TABLE infra_ingest_items
  ADD COLUMN IF NOT EXISTS ignored_reason TEXT;
