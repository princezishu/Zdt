CREATE TABLE IF NOT EXISTS infra_updates (
  id BIGSERIAL PRIMARY KEY,
  state VARCHAR(80) NOT NULL,
  district VARCHAR(120) NOT NULL,
  cities TEXT[] NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('PROPOSED', 'APPROVED', 'UNDER_CONSTRUCTION', 'COMPLETED')),
  project_name VARCHAR(200) NOT NULL,
  authority VARCHAR(120) NOT NULL,
  project_type VARCHAR(120) NOT NULL,
  status_text TEXT NOT NULL,
  impact_level VARCHAR(20) NOT NULL CHECK (impact_level IN ('LOW', 'MEDIUM', 'HIGH')),
  source_ref TEXT NOT NULL,
  source_url TEXT,
  verification_level VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (
      verification_level IN (
        'PUBLIC_NOTICE',
        'TENDER',
        'SOURCE_ONLY',
        'OFFICE_CONFIRMED',
        'LOCAL_REPORT',
        'UNKNOWN'
      )
    ),
  last_updated DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infra_state_district ON infra_updates (state, district);
CREATE INDEX IF NOT EXISTS idx_infra_state ON infra_updates (state);
CREATE INDEX IF NOT EXISTS idx_infra_district ON infra_updates (district);
CREATE INDEX IF NOT EXISTS idx_infra_category ON infra_updates (category);
CREATE INDEX IF NOT EXISTS idx_infra_last_updated ON infra_updates (last_updated DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_infra_cities_gin ON infra_updates USING GIN (cities);
