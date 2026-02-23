-- Main Admin Site Promotions
-- Sponsored banners, popup ads, and top listed property promotions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS site_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_type VARCHAR(24) NOT NULL,
  title VARCHAR(180) NOT NULL,
  subtitle VARCHAR(240) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  property_reference VARCHAR(80) NOT NULL DEFAULT '',
  cta_label VARCHAR(60) NOT NULL DEFAULT '',
  badge_text VARCHAR(60) NOT NULL DEFAULT '',
  open_in_new_tab BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_promotions_type_check'
  ) THEN
    ALTER TABLE site_promotions
      ADD CONSTRAINT site_promotions_type_check
      CHECK (promo_type IN ('sponsored_banner', 'popup_ad', 'top_property'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_promotions_sort_non_negative_check'
  ) THEN
    ALTER TABLE site_promotions
      ADD CONSTRAINT site_promotions_sort_non_negative_check
      CHECK (sort_order >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_promotions_active_window_check'
  ) THEN
    ALTER TABLE site_promotions
      ADD CONSTRAINT site_promotions_active_window_check
      CHECK (
        start_at IS NULL
        OR end_at IS NULL
        OR start_at <= end_at
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_site_promotions_updated_at ON site_promotions;
CREATE TRIGGER trg_site_promotions_updated_at
BEFORE UPDATE ON site_promotions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS site_promotions_public_idx
  ON site_promotions (is_active, promo_type, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS site_promotions_window_idx
  ON site_promotions (start_at, end_at);
