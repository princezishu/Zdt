UPDATE infra_updates
SET verification_level = UPPER(TRIM(verification_level))
WHERE COALESCE(TRIM(verification_level), '') <> '';

UPDATE infra_updates
SET verification_level = 'UNKNOWN'
WHERE verification_level IS NULL
  OR COALESCE(TRIM(verification_level), '') = ''
  OR verification_level NOT IN (
    'PUBLIC_NOTICE',
    'TENDER',
    'SOURCE_ONLY',
    'OFFICE_CONFIRMED',
    'LOCAL_REPORT',
    'UNKNOWN'
  );

UPDATE infra_updates
SET verification_level = 'SOURCE_ONLY'
WHERE verification_level = 'UNKNOWN'
  AND COALESCE(TRIM(source_url), '') <> ''
  AND COALESCE(TRIM(source_ref), '') <> '';

ALTER TABLE infra_updates
  DROP CONSTRAINT IF EXISTS infra_updates_verification_level_enum_check;

ALTER TABLE infra_updates
  ADD CONSTRAINT infra_updates_verification_level_enum_check
  CHECK (
    verification_level IN (
      'PUBLIC_NOTICE',
      'TENDER',
      'SOURCE_ONLY',
      'OFFICE_CONFIRMED',
      'LOCAL_REPORT',
      'UNKNOWN'
    )
  );

CREATE INDEX IF NOT EXISTS idx_infra_state_verification_last_updated
  ON infra_updates (state, verification_level, last_updated DESC, id DESC);
