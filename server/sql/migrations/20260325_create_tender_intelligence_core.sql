CREATE TABLE IF NOT EXISTS tender_intelligence_sources (
  id BIGSERIAL PRIMARY KEY,
  source_key VARCHAR(80) NOT NULL UNIQUE,
  track VARCHAR(20) NOT NULL
    CHECK (track IN ('government', 'private')),
  source_type VARCHAR(40) NOT NULL
    CHECK (
      source_type IN (
        'government_tender',
        'government_notice',
        'award',
        'private_opportunity',
        'village_signal'
      )
    ),
  source_name VARCHAR(160) NOT NULL,
  source_url TEXT NOT NULL,
  collection_method VARCHAR(20) NOT NULL DEFAULT 'html'
    CHECK (collection_method IN ('api', 'rss', 'html', 'pdf', 'manual', 'hybrid')),
  verification_level VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (
      verification_level IN (
        'OFFICIAL_PORTAL',
        'OFFICIAL_DEPARTMENT_SITE',
        'PUBLIC_NOTICE_PRESS_RELEASE',
        'MARKET_SOURCE',
        'UNKNOWN'
      )
    ),
  coverage_scope VARCHAR(20) NOT NULL DEFAULT 'national'
    CHECK (
      coverage_scope IN (
        'national',
        'state',
        'district',
        'block',
        'village',
        'private_network'
      )
    ),
  coverage_state_name VARCHAR(120),
  priority_order INTEGER NOT NULL DEFAULT 100,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 1440
    CHECK (refresh_interval_minutes BETWEEN 15 AND 10080),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_sources_track
  ON tender_intelligence_sources (track, is_active, priority_order);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_sources_type
  ON tender_intelligence_sources (source_type, is_active);

CREATE TABLE IF NOT EXISTS tender_intelligence_records (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES tender_intelligence_sources(id) ON DELETE SET NULL,
  track VARCHAR(20) NOT NULL
    CHECK (track IN ('government', 'private')),
  source_type VARCHAR(40) NOT NULL
    CHECK (
      source_type IN (
        'government_tender',
        'government_notice',
        'award',
        'private_opportunity',
        'village_signal'
      )
    ),
  source_name VARCHAR(160) NOT NULL,
  source_url TEXT NOT NULL,
  external_id VARCHAR(200),
  record_hash VARCHAR(64),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  authority_name VARCHAR(200),
  department_name VARCHAR(200),
  sector VARCHAR(120),
  work_type VARCHAR(120),
  state_name VARCHAR(120),
  district_name VARCHAR(120),
  block_name VARCHAR(120),
  village_name VARCHAR(200),
  lgd_state_code VARCHAR(20),
  lgd_district_code VARCHAR(20),
  lgd_block_code VARCHAR(20),
  lgd_village_code VARCHAR(20),
  budget_amount NUMERIC(18, 2),
  emd_amount NUMERIC(18, 2),
  tender_status VARCHAR(80),
  published_at TIMESTAMPTZ,
  bid_end_at TIMESTAMPTZ,
  opening_at TIMESTAMPTZ,
  document_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_text TEXT NOT NULL DEFAULT '',
  normalized_text TEXT NOT NULL DEFAULT '',
  verification_level VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (
      verification_level IN (
        'OFFICIAL_PORTAL',
        'OFFICIAL_DEPARTMENT_SITE',
        'PUBLIC_NOTICE_PRESS_RELEASE',
        'MARKET_SOURCE',
        'UNKNOWN'
      )
    ),
  parser_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (parser_status IN ('PENDING', 'PARSED', 'PARTIAL', 'FAILED')),
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (
      moderation_status IN (
        'AUTO_APPROVED',
        'REVIEW_REQUIRED',
        'MANUALLY_APPROVED',
        'REJECTED'
      )
    ),
  impact_score NUMERIC(6, 2) NOT NULL DEFAULT 0
    CHECK (impact_score BETWEEN 0 AND 100),
  geo_lat NUMERIC(9, 6),
  geo_lng NUMERIC(9, 6),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tender_intelligence_records_source_external_unique
    UNIQUE (source_id, external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_intelligence_records_record_hash_unique
  ON tender_intelligence_records (record_hash)
  WHERE record_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_track_type
  ON tender_intelligence_records (track, source_type, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_location_codes
  ON tender_intelligence_records (
    lgd_state_code,
    lgd_district_code,
    lgd_block_code,
    lgd_village_code
  );

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_dates
  ON tender_intelligence_records (published_at DESC, bid_end_at DESC, opening_at DESC);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_status
  ON tender_intelligence_records (verification_level, parser_status, moderation_status);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_budget
  ON tender_intelligence_records (budget_amount DESC NULLS LAST, impact_score DESC);

CREATE TABLE IF NOT EXISTS tender_intelligence_documents (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES tender_intelligence_records(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL DEFAULT 'OTHER'
    CHECK (
      document_type IN (
        'NOTICE',
        'NIT',
        'CORRIGENDUM',
        'BOQ',
        'AWARD',
        'PRESS_RELEASE',
        'DRAWING',
        'OTHER'
      )
    ),
  label VARCHAR(200) NOT NULL DEFAULT '',
  document_url TEXT NOT NULL,
  file_format VARCHAR(20),
  extracted_text TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_documents_record
  ON tender_intelligence_documents (record_id, document_type, created_at DESC);

CREATE TABLE IF NOT EXISTS tender_intelligence_history (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES tender_intelligence_records(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL
    CHECK (
      event_type IN (
        'published',
        'corrigendum',
        'bid_closing_updated',
        'awarded',
        'cancelled',
        'archived',
        'manual_review',
        'status_sync'
      )
    ),
  previous_status VARCHAR(80),
  next_status VARCHAR(80),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary TEXT NOT NULL DEFAULT '',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_history_record
  ON tender_intelligence_history (record_id, event_at DESC);

CREATE TABLE IF NOT EXISTS tender_intelligence_source_health_logs (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES tender_intelligence_sources(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('HEALTHY', 'DEGRADED', 'FAILED', 'PAUSED')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_code INTEGER,
  duration_ms INTEGER,
  note TEXT NOT NULL DEFAULT '',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tender_intelligence_source_health_logs_source
  ON tender_intelligence_source_health_logs (source_id, checked_at DESC);
