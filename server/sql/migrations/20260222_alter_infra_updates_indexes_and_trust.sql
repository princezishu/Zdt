CREATE INDEX IF NOT EXISTS idx_infra_state
  ON infra_updates (state);

CREATE INDEX IF NOT EXISTS idx_infra_district
  ON infra_updates (district);

CREATE INDEX IF NOT EXISTS idx_infra_verification_level
  ON infra_updates (verification_level);

CREATE INDEX IF NOT EXISTS idx_infra_category
  ON infra_updates (category);

CREATE INDEX IF NOT EXISTS idx_infra_last_updated
  ON infra_updates (last_updated DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_infra_cities_gin
  ON infra_updates USING GIN (cities);
