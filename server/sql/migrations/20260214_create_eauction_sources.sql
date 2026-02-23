-- Migration: Create eauction_sources table for official bank/government e-auction portals.

CREATE TABLE IF NOT EXISTS eauction_sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  portal_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eauction_sources_category_check'
  ) THEN
    ALTER TABLE eauction_sources
      ADD CONSTRAINT eauction_sources_category_check
      CHECK (category IN ('plots', 'apartments', 'complex', 'all'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS eauction_sources_portal_url_unique
  ON eauction_sources (portal_url);

-- updated_at trigger helper (shared pattern).
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eauction_sources_updated_at ON eauction_sources;
CREATE TRIGGER trg_eauction_sources_updated_at
BEFORE UPDATE ON eauction_sources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
