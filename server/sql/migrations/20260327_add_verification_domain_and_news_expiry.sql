ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 days');

UPDATE news_articles
SET expires_at = COALESCE(published_at, created_at, NOW()) + INTERVAL '10 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS news_articles_expires_idx
  ON news_articles (expires_at ASC);

CREATE TABLE IF NOT EXISTS govt_source_registry (
  id BIGSERIAL PRIMARY KEY,
  authority_name VARCHAR(180) NOT NULL,
  source_type VARCHAR(24) NOT NULL DEFAULT 'other'
    CHECK (source_type IN ('government_portal', 'rera', 'bank_portal', 'municipal', 'court_notice', 'other')),
  source_url TEXT,
  authority_scope VARCHAR(120) NOT NULL DEFAULT '',
  verification_weight INT NOT NULL DEFAULT 5
    CHECK (verification_weight BETWEEN 0 AND 20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS govt_source_registry_source_url_unique
  ON govt_source_registry (source_url)
  WHERE source_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS builder_verification_cases (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  case_type VARCHAR(32) NOT NULL
    CHECK (case_type IN ('kyc', 'rera', 'project_document', 'ownership', 'banking', 'site_audit')),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_changes')),
  priority VARCHAR(12) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  note TEXT NOT NULL DEFAULT '',
  public_note VARCHAR(300) NOT NULL DEFAULT '',
  trust_score_delta INT NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_authority_id BIGINT REFERENCES govt_source_registry(id) ON DELETE SET NULL,
  source_reference_url TEXT,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS builder_verification_cases_company_status_idx
  ON builder_verification_cases (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS property_verification_cases (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  case_type VARCHAR(32) NOT NULL
    CHECK (case_type IN ('listing_authenticity', 'ownership', 'pricing', 'location', 'rera', 'media')),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_changes')),
  priority VARCHAR(12) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  note TEXT NOT NULL DEFAULT '',
  public_note VARCHAR(300) NOT NULL DEFAULT '',
  trust_score_delta INT NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_authority_id BIGINT REFERENCES govt_source_registry(id) ON DELETE SET NULL,
  source_reference_url TEXT,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS property_verification_cases_property_status_idx
  ON property_verification_cases (property_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ownership_verification_checks (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  case_id BIGINT REFERENCES property_verification_cases(id) ON DELETE SET NULL,
  owner_name VARCHAR(160) NOT NULL,
  owner_phone VARCHAR(32) NOT NULL DEFAULT '',
  document_type VARCHAR(80) NOT NULL,
  check_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (check_status IN ('pending', 'verified', 'failed', 'manual_review')),
  result_summary VARCHAR(500) NOT NULL DEFAULT '',
  source_authority_id BIGINT REFERENCES govt_source_registry(id) ON DELETE SET NULL,
  checked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ownership_verification_checks_property_checked_idx
  ON ownership_verification_checks (property_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS fake_listing_reports (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  property_reference VARCHAR(80) NOT NULL DEFAULT '',
  reporter_name VARCHAR(120) NOT NULL,
  reporter_email VARCHAR(190) NOT NULL DEFAULT '',
  reporter_phone VARCHAR(32) NOT NULL DEFAULT '',
  reason VARCHAR(32) NOT NULL
    CHECK (reason IN ('duplicate_listing', 'wrong_price', 'wrong_location', 'ownership_doubt', 'scam_behavior', 'fake_media', 'other')),
  details TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'resolved', 'rejected')),
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fake_listing_reports_open_idx
  ON fake_listing_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS fake_listing_reports_property_idx
  ON fake_listing_reports (property_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fraud_actions (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES fake_listing_reports(id) ON DELETE SET NULL,
  action_key VARCHAR(24) NOT NULL
    CHECK (action_key IN ('flag_listing', 'warn_builder', 'reject_report', 'resolve_report', 'suspend_listing', 'keep_listing_live')),
  action_note TEXT NOT NULL DEFAULT '',
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_actions_report_idx
  ON fraud_actions (report_id, created_at DESC);
