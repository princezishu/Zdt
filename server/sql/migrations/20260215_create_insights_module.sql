-- News & Market Insights Module
-- Automated RSS/news, market snapshots, project announcements, and scheduler logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  rss_url TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  image_url TEXT,
  snippet TEXT,
  category VARCHAR(80),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_city_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city VARCHAR(120) NOT NULL,
  period DATE NOT NULL,
  avg_price_sqft NUMERIC(14, 2) NOT NULL,
  mom_change NUMERIC(8, 2),
  yoy_change NUMERIC(8, 2),
  source VARCHAR(60) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_city_prices_unique UNIQUE (city, period, source)
);

CREATE TABLE IF NOT EXISTS builder_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_name VARCHAR(160) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'rss',
  source_url TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_source_id UUID NOT NULL REFERENCES builder_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  city VARCHAR(120),
  locality VARCHAR(140),
  price_hint VARCHAR(120),
  possession_hint VARCHAR(140),
  status VARCHAR(30) NOT NULL DEFAULT 'announcement',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(120) NOT NULL,
  status VARCHAR(10) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  items_fetched INT NOT NULL DEFAULT 0,
  items_inserted INT NOT NULL DEFAULT 0,
  error TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'builder_sources_type_check'
  ) THEN
    ALTER TABLE builder_sources
      ADD CONSTRAINT builder_sources_type_check
      CHECK (source_type IN ('rss'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_city_prices_avg_positive_check'
  ) THEN
    ALTER TABLE market_city_prices
      ADD CONSTRAINT market_city_prices_avg_positive_check
      CHECK (avg_price_sqft > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_runs_status_check'
  ) THEN
    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_status_check
      CHECK (status IN ('success', 'fail'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS news_articles_created_idx
  ON news_articles (created_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_source_idx
  ON news_articles (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS news_clicks_article_idx
  ON news_clicks (article_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS market_city_prices_city_period_idx
  ON market_city_prices (city, period DESC, fetched_at DESC);
CREATE INDEX IF NOT EXISTS project_announcements_source_idx
  ON project_announcements (builder_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_announcements_city_idx
  ON project_announcements (city, created_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_job_started_idx
  ON job_runs (job_name, started_at DESC);
