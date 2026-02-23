-- Seed: Insights RSS sources (news + builders)

INSERT INTO news_sources (name, rss_url, is_active)
VALUES
  (
    'News18 Real Estate',
    'https://www.news18.com/commonfeeds/v1/eng/rss/real-estate.xml',
    TRUE
  ),
  (
    'Hindustan Times Real Estate',
    'https://www.hindustantimes.com/feeds/rss/real-estate/rssfeed.xml',
    TRUE
  ),
  (
    'The Hindu Property Plus',
    'https://www.thehindu.com/real-estate/feeder/default.rss',
    TRUE
  )
ON CONFLICT (rss_url)
DO UPDATE
  SET name = EXCLUDED.name,
      is_active = EXCLUDED.is_active;

INSERT INTO builder_sources (builder_name, source_type, source_url, is_active)
VALUES
  (
    'Sobha Realty',
    'rss',
    'https://www.sobha.com/blog/feed/',
    TRUE
  ),
  (
    'Godrej Properties',
    'rss',
    'https://www.godrejproperties.com/blog/feed/',
    TRUE
  ),
  (
    'Brigade Group',
    'rss',
    'https://www.brigadegroup.com/blog/feed/',
    TRUE
  )
ON CONFLICT (source_url)
DO UPDATE
  SET builder_name = EXCLUDED.builder_name,
      source_type = EXCLUDED.source_type,
      is_active = EXCLUDED.is_active;
