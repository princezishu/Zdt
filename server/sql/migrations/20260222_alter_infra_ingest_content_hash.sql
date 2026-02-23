ALTER TABLE infra_ingest_items
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE infra_ingest_items
  ADD COLUMN IF NOT EXISTS published_update_id BIGINT;

ALTER TABLE infra_ingest_items
  ADD COLUMN IF NOT EXISTS ignored_reason TEXT;

UPDATE infra_ingest_items
SET content_hash = MD5(
  COALESCE(LOWER(TRIM(title)), '') || '||' ||
  COALESCE(LOWER(TRIM(link)), '') || '||' ||
  COALESCE(LOWER(TRIM(summary)), '') || '||' ||
  COALESCE(TO_CHAR(published_at, 'YYYY-MM-DD'), '') || '||' ||
  COALESCE(LOWER(TRIM(item_guid)), '')
)
WHERE content_hash IS NULL
   OR COALESCE(TRIM(content_hash), '') = '';

WITH ranked AS (
  SELECT
    id,
    source_key,
    content_hash,
    ROW_NUMBER() OVER (PARTITION BY source_key, content_hash ORDER BY id ASC) AS rn
  FROM infra_ingest_items
)
UPDATE infra_ingest_items AS target
SET content_hash = target.content_hash || '-' || target.id::text
FROM ranked
WHERE ranked.id = target.id
  AND ranked.rn > 1;

ALTER TABLE infra_ingest_items
  ALTER COLUMN content_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_source_hash_unique
  ON infra_ingest_items (source_key, content_hash);
