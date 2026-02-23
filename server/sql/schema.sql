CREATE DATABASE zdt_realty;

\c zdt_realty;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(32),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_main_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  deactivated_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'owner', 'agent', 'builder', 'team_member', 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_main_admin_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_main_admin_role_check
      CHECK ((NOT is_main_admin) OR role = 'admin');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_main_admin_idx
  ON users (is_main_admin)
  WHERE is_main_admin = TRUE;

CREATE OR REPLACE FUNCTION enforce_admin_limit()
RETURNS TRIGGER AS $$
DECLARE
  admin_count INTEGER;
BEGIN
  IF NEW.role = 'admin' AND NEW.is_main_admin = FALSE AND NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO admin_count
    FROM users
    WHERE role = 'admin'
      AND is_main_admin = FALSE
      AND is_active = TRUE
      AND id <> COALESCE(NEW.id, -1);

    IF admin_count >= 2 THEN
      RAISE EXCEPTION 'Admin account limit reached (maximum 2)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_admin_limit ON users;
CREATE TRIGGER trg_users_admin_limit
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_admin_limit();

CREATE OR REPLACE FUNCTION enforce_team_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  team_count INTEGER;
BEGIN
  IF NEW.role = 'team_member' AND NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO team_count
    FROM users
    WHERE role = 'team_member'
      AND is_active = TRUE
      AND id <> COALESCE(NEW.id, -1);

    IF team_count >= 5 THEN
      RAISE EXCEPTION 'Team member account limit reached (maximum 5)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_team_member_limit ON users;
CREATE TRIGGER trg_users_team_member_limit
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_team_member_limit();

CREATE TABLE IF NOT EXISTS password_reset_otps (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  otp_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(120) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT user_sessions_user_device_unique UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  state VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(120) NOT NULL DEFAULT 'India',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  communication JSONB NOT NULL DEFAULT '{}'::jsonb,
  government_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  government_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS main_admin_profile_media (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL
    CHECK (category IN ('new_project', 'construction_done')),
  media_type VARCHAR(16) NOT NULL
    CHECK (media_type IN ('image', 'video')),
  mime_type VARCHAR(80) NOT NULL,
  media_url TEXT NOT NULL,
  title VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_requests (
  id BIGSERIAL PRIMARY KEY,
  reference_id VARCHAR(40) NOT NULL UNIQUE,
  request_type VARCHAR(12) NOT NULL CHECK (request_type IN ('buy', 'sell', 'rent')),
  source VARCHAR(24) NOT NULL DEFAULT 'public',
  submitted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_task_type VARCHAR(24),
  assigned_task_query TEXT NOT NULL DEFAULT '',
  assigned_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_by_team_member_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requester_name VARCHAR(120) NOT NULL,
  requester_phone VARCHAR(32) NOT NULL,
  requester_email VARCHAR(190),
  city VARCHAR(120) NOT NULL,
  locality VARCHAR(160) NOT NULL DEFAULT '',
  property_type VARCHAR(40) NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  map_pin TEXT NOT NULL DEFAULT '',
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  need_help BOOLEAN NOT NULL DEFAULT FALSE,
  help_type VARCHAR(80),
  preferred_call_time VARCHAR(20),
  assisted_listing BOOLEAN NOT NULL DEFAULT FALSE,
  interaction_status VARCHAR(20) NOT NULL DEFAULT 'New'
    CHECK (interaction_status IN ('New', 'Contacted', 'Scheduled', 'Completed')),
  listing_status VARCHAR(24) NOT NULL DEFAULT 'Pending'
    CHECK (listing_status IN ('Pending', 'Approved', 'Rejected', 'Sold', 'Rented')),
  workflow_stage VARCHAR(24) NOT NULL DEFAULT 'Pending Approval'
    CHECK (workflow_stage IN ('Draft', 'Pending Approval', 'Approved', 'Rejected')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  internal_notes TEXT NOT NULL DEFAULT '',
  is_fake BOOLEAN NOT NULL DEFAULT FALSE,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE property_requests
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(24) NOT NULL DEFAULT 'Pending Approval',
  ADD COLUMN IF NOT EXISTS assigned_task_type VARCHAR(24),
  ADD COLUMN IF NOT EXISTS assigned_task_query TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assigned_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_requests_workflow_stage_check'
  ) THEN
    ALTER TABLE property_requests
      ADD CONSTRAINT property_requests_workflow_stage_check
      CHECK (workflow_stage IN ('Draft', 'Pending Approval', 'Approved', 'Rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_requests_assigned_task_type_check'
  ) THEN
    ALTER TABLE property_requests
      ADD CONSTRAINT property_requests_assigned_task_type_check
      CHECK (
        assigned_task_type IS NULL
        OR assigned_task_type IN ('call_user', 'add_property', 'handle_query')
      );
  END IF;
END $$;

UPDATE property_requests
SET workflow_stage = CASE
  WHEN listing_status = 'Rejected' THEN 'Rejected'
  WHEN listing_status IN ('Approved', 'Sold', 'Rented') THEN 'Approved'
  ELSE 'Pending Approval'
END
WHERE workflow_stage IS NULL
  OR workflow_stage NOT IN ('Draft', 'Pending Approval', 'Approved', 'Rejected');

CREATE TABLE IF NOT EXISTS phone_verification_otps (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  verification_token VARCHAR(80) NOT NULL UNIQUE,
  verification_id VARCHAR(80) UNIQUE,
  otp_hash VARCHAR(128) NOT NULL,
  purpose VARCHAR(24) NOT NULL DEFAULT 'workflow',
  attempts SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_request_status_history (
  id BIGSERIAL PRIMARY KEY,
  property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
  changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  field_name VARCHAR(32) NOT NULL,
  previous_value TEXT,
  next_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS career_applications (
  id BIGSERIAL PRIMARY KEY,
  reference_id VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(190) NOT NULL,
  city VARCHAR(120) NOT NULL,
  position VARCHAR(20) NOT NULL CHECK (position IN ('admin', 'team_member')),
  registration_number VARCHAR(64) NOT NULL DEFAULT '',
  security_question_one VARCHAR(255) NOT NULL DEFAULT '',
  security_answer_one_hash VARCHAR(128) NOT NULL DEFAULT '',
  security_question_two VARCHAR(255) NOT NULL DEFAULT '',
  security_answer_two_hash VARCHAR(128) NOT NULL DEFAULT '',
  aadhaar_number VARCHAR(12),
  pan_number VARCHAR(10),
  team_specialization VARCHAR(120),
  team_preferred_shift VARCHAR(40),
  experience TEXT,
  why_hire TEXT NOT NULL,
  account_password_hash VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Auto-Rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_account_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE career_applications
  ADD COLUMN IF NOT EXISTS registration_number VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_question_one VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_answer_one_hash VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_question_two VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_answer_two_hash VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12),
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10),
  ADD COLUMN IF NOT EXISTS team_specialization VARCHAR(120),
  ADD COLUMN IF NOT EXISTS team_preferred_shift VARCHAR(40),
  ADD COLUMN IF NOT EXISTS account_password_hash VARCHAR(128) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS career_application_status_history (
  id BIGSERIAL PRIMARY KEY,
  career_application_id BIGINT NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
  changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  previous_status VARCHAR(24),
  next_status VARCHAR(24) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NOT NULL DEFAULT '',
  action_key VARCHAR(80) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT,
  request_reference VARCHAR(40),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_favorite_listings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_favorite_listings_unique UNIQUE (user_id, property_request_id)
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  conversation_key VARCHAR(160) NOT NULL UNIQUE,
  conversation_type VARCHAR(24) NOT NULL
    CHECK (conversation_type IN ('team_support', 'property_owner', 'builder_company')),
  status VARCHAR(16) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Closed')),
  subject VARCHAR(180) NOT NULL DEFAULT '',
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  owner_name VARCHAR(120) NOT NULL DEFAULT '',
  property_request_id BIGINT REFERENCES property_requests(id) ON DELETE SET NULL,
  last_message_preview VARCHAR(240) NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  sender_role VARCHAR(24) NOT NULL
    CHECK (sender_role IN ('user', 'team_member', 'admin', 'owner', 'system')),
  sender_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_message_receipts (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_delivered_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_message_receipts_unique UNIQUE (conversation_id, user_id)
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_requests_updated_at ON property_requests;
CREATE TRIGGER trg_property_requests_updated_at
BEFORE UPDATE ON property_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_career_applications_updated_at ON career_applications;
CREATE TRIGGER trg_career_applications_updated_at
BEFORE UPDATE ON career_applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_main_admin_profile_media_updated_at ON main_admin_profile_media;
CREATE TRIGGER trg_main_admin_profile_media_updated_at
BEFORE UPDATE ON main_admin_profile_media
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_updated_at
BEFORE UPDATE ON chat_conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_chat_message_receipts_updated_at ON chat_message_receipts;
CREATE TRIGGER trg_chat_message_receipts_updated_at
BEFORE UPDATE ON chat_message_receipts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS idx_property_requests_request_type ON property_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_property_requests_interaction_status ON property_requests(interaction_status);
CREATE INDEX IF NOT EXISTS idx_property_requests_listing_status ON property_requests(listing_status);
CREATE INDEX IF NOT EXISTS idx_property_requests_workflow_stage ON property_requests(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_property_requests_assisted_listing ON property_requests(assisted_listing);
CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_to_user ON property_requests(assigned_to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_task_type ON property_requests(assigned_task_type);
CREATE INDEX IF NOT EXISTS idx_property_requests_created_at ON property_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_applications_status ON career_applications(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user ON activity_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_key ON activity_logs(action_key);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_country ON user_profiles(country);
CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_user_created ON main_admin_profile_media(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_category ON main_admin_profile_media(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_user_created ON user_favorite_listings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_property ON user_favorite_listings(property_request_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_requester ON chat_conversations(requester_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON chat_conversations(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_type_status ON chat_conversations(conversation_type, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_sender_role ON chat_messages(conversation_id, sender_role, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_conversation_updated ON chat_message_receipts(conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_user_updated ON chat_message_receipts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_verification_otps_lookup ON phone_verification_otps(verification_token, phone);
CREATE INDEX IF NOT EXISTS idx_phone_verification_otps_phone_created ON phone_verification_otps(phone, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash_active
  ON user_sessions(token_hash)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_applications_registration_number_unique
  ON career_applications(registration_number)
  WHERE registration_number <> '';

-- E-Auction sources (bank & government official portals).
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

DROP TRIGGER IF EXISTS trg_eauction_sources_updated_at ON eauction_sources;
CREATE TRIGGER trg_eauction_sources_updated_at
BEFORE UPDATE ON eauction_sources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO eauction_sources (
  name,
  portal_url,
  category,
  description,
  badges,
  is_active,
  sort_order
)
VALUES
  (
    'e-Auction India (Indian Banks)',
    'https://www.eauctionindia.com/property-auction',
    'all',
    'Direct property-auction listing page for SARFAESI and bank auctions.',
    ARRAY['Official', 'Bank Auction', 'SARFAESI']::TEXT[],
    TRUE,
    10
  ),
  (
    'MSTC eCommerce (Govt PSU)',
    'https://www.mstcecommerce.com/auctionhome/',
    'all',
    'Direct auction home for government, PSU and institutional e-auctions.',
    ARRAY['Official', 'Govt PSU', 'e-Auction']::TEXT[],
    TRUE,
    20
  ),
  (
    'SBI Auctions',
    'https://sbi.bank.in/web/sbi-in-the-news/auction-notices',
    'all',
    'Direct SBI auction notices page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    30
  ),
  (
    'Bank of Baroda e-Auction',
    'https://bankofbaroda.bank.in/e-auction',
    'all',
    'Direct Bank of Baroda e-auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    40
  ),
  (
    'PNB e-Auction',
    'https://pnb.bank.in/eAuction.aspx/Tender.aspx',
    'all',
    'Direct PNB e-auction tender listings page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    50
  ),
  (
    'Canara Bank e-Auction',
    'https://www.canarabank.bank.in/e-auction',
    'all',
    'Direct Canara Bank e-auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    60
  ),
  (
    'ICICI Bank Property Auctions',
    'https://www.icicihfc.com/property-auction',
    'all',
    'Direct ICICI Home Finance property auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    70
  )
ON CONFLICT (portal_url)
DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      badges = EXCLUDED.badges,
      is_active = TRUE,
      sort_order = EXCLUDED.sort_order;

-- Builder/Dealer base tables
CREATE TABLE IF NOT EXISTS builder_companies (
  id BIGSERIAL PRIMARY KEY,
  company_code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  company_type VARCHAR(20) NOT NULL DEFAULT 'builder',
  logo_url TEXT NOT NULL DEFAULT '',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'builder_companies_type_check'
  ) THEN
    ALTER TABLE builder_companies
      ADD CONSTRAINT builder_companies_type_check
      CHECK (company_type IN ('dealer', 'builder'));
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id BIGINT,
  ADD COLUMN IF NOT EXISTS company_role VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_company_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_company_role_check
      CHECK (company_role IS NULL OR company_role IN ('owner', 'member'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_company_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES builder_companies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_company_id_idx
  ON users (company_id)
  WHERE company_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_builder_companies_updated_at ON builder_companies;
CREATE TRIGGER trg_builder_companies_updated_at
BEFORE UPDATE ON builder_companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS builder_company_banners (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES builder_companies(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  subtitle VARCHAR(200) NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_builder_company_banners_updated_at ON builder_company_banners;
CREATE TRIGGER trg_builder_company_banners_updated_at
BEFORE UPDATE ON builder_company_banners
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS builder_company_banners_company_id_idx
  ON builder_company_banners (company_id);
CREATE INDEX IF NOT EXISTS builder_company_banners_active_sort_idx
  ON builder_company_banners (is_active, sort_order, created_at);

-- Startup realty module tables (required)
CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  company_type VARCHAR(20) NOT NULL DEFAULT 'builder',
  city VARCHAR(120) NOT NULL DEFAULT '',
  state VARCHAR(120) NOT NULL DEFAULT '',
  area VARCHAR(160) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  rera_number VARCHAR(80) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  service_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  logo_url TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL DEFAULT '',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_company_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_company_type_check
  CHECK (company_type IN ('dealer', 'builder', 'owner'));

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_name VARCHAR(180) NOT NULL,
  project_type VARCHAR(24) NOT NULL,
  state VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  area VARCHAR(160) NOT NULL,
  full_address TEXT NOT NULL,
  landmark VARCHAR(180) NOT NULL DEFAULT '',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  price_min NUMERIC(14, 2),
  price_max NUMERIC(14, 2),
  price_per_sqft NUMERIC(14, 2),
  configurations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_units INT,
  total_floors INT,
  total_area NUMERIC(14, 2),
  possession_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'Upcoming',
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  brochure_url TEXT NOT NULL DEFAULT '',
  highlights TEXT NOT NULL DEFAULT '',
  construction_overall_status VARCHAR(32) NOT NULL DEFAULT 'Planning',
  construction_completion_percent INT NOT NULL DEFAULT 0,
  construction_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  construction_last_updated_at TIMESTAMPTZ,
  construction_estimated_completion_date DATE,
  construction_schedule_status VARCHAR(24) NOT NULL DEFAULT 'on_schedule',
  construction_delay_reason TEXT NOT NULL DEFAULT '',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS construction_overall_status VARCHAR(32) NOT NULL DEFAULT 'Planning',
  ADD COLUMN IF NOT EXISTS construction_completion_percent INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS construction_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS construction_last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS construction_estimated_completion_date DATE,
  ADD COLUMN IF NOT EXISTS construction_schedule_status VARCHAR(24) NOT NULL DEFAULT 'on_schedule',
  ADD COLUMN IF NOT EXISTS construction_delay_reason TEXT NOT NULL DEFAULT '';

UPDATE projects
SET construction_last_updated_at = COALESCE(construction_last_updated_at, updated_at, created_at, NOW())
WHERE construction_last_updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_type_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_project_type_check
      CHECK (project_type IN ('Apartment', 'Villa', 'Plotted', 'Commercial'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('Upcoming', 'Under Construction', 'Ready to Move'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_construction_overall_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_construction_overall_status_check
      CHECK (
        construction_overall_status IN (
          'Planning',
          'Approved',
          'Under Construction',
          'Near Completion',
          'Completed'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_construction_completion_percent_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_construction_completion_percent_check
      CHECK (construction_completion_percent >= 0 AND construction_completion_percent <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_construction_schedule_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_construction_schedule_status_check
      CHECK (construction_schedule_status IN ('on_schedule', 'slight_delay', 'major_delay'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS project_construction_updates (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  photo_urls TEXT[] NOT NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_construction_updates_approval_status_check'
  ) THEN
    ALTER TABLE project_construction_updates
      ADD CONSTRAINT project_construction_updates_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_construction_updates_photo_count_check'
  ) THEN
    ALTER TABLE project_construction_updates
      ADD CONSTRAINT project_construction_updates_photo_count_check
      CHECK (cardinality(photo_urls) BETWEEN 3 AND 6);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_project_construction_updates_updated_at ON project_construction_updates;
CREATE TRIGGER trg_project_construction_updates_updated_at
BEFORE UPDATE ON project_construction_updates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS properties (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  title VARCHAR(220) NOT NULL,
  property_type VARCHAR(32) NOT NULL,
  listing_type VARCHAR(16) NOT NULL,
  price NUMERIC(14, 2),
  price_per_sqft NUMERIC(14, 2),
  rent_per_month NUMERIC(14, 2),
  rent_deposit NUMERIC(14, 2),
  state VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  area VARCHAR(160) NOT NULL,
  locality VARCHAR(160) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  full_address TEXT NOT NULL,
  landmark VARCHAR(180) NOT NULL DEFAULT '',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  area_sqft NUMERIC(14, 2),
  carpet_area NUMERIC(14, 2),
  builtup_area NUMERIC(14, 2),
  super_builtup_area NUMERIC(14, 2),
  bedrooms INT,
  bathrooms INT,
  floor_number INT,
  total_floors INT,
  facing VARCHAR(20) NOT NULL DEFAULT 'NA',
  is_corner BOOLEAN NOT NULL DEFAULT FALSE,
  is_vaastu BOOLEAN NOT NULL DEFAULT FALSE,
  possession_status VARCHAR(40) NOT NULL DEFAULT 'ready',
  rera_number VARCHAR(80) NOT NULL DEFAULT '',
  furnishing VARCHAR(20) NOT NULL DEFAULT 'na',
  is_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
  is_prelaunch BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INT NOT NULL DEFAULT 0,
  availability_date DATE,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  description TEXT NOT NULL DEFAULT '',
  layout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  posted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS layout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_per_sqft NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS locality VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS carpet_area NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS builtup_area NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS super_builtup_area NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS floor_number INT,
  ADD COLUMN IF NOT EXISTS total_floors INT,
  ADD COLUMN IF NOT EXISTS facing VARCHAR(20) NOT NULL DEFAULT 'NA',
  ADD COLUMN IF NOT EXISTS is_corner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_vaastu BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS possession_status VARCHAR(40) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS rera_number VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_prelaunch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_property_type_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_property_type_check
      CHECK (property_type IN (
        'Apartment',
        'Villa',
        'Plotted',
        'Commercial',
        'Independent House',
        'Shop',
        'Office',
        'Warehouse',
        'Studio',
        'Duplex'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_listing_type_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_listing_type_check
      CHECK (listing_type IN ('sale', 'rent'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_furnishing_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_furnishing_check
      CHECK (furnishing IN ('furnished', 'semi_furnished', 'unfurnished', 'na'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_possession_status_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_possession_status_check
      CHECK (possession_status IN ('ready', 'under_construction', 'pre_launch', 'resale'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_price_or_rent_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_price_or_rent_check
      CHECK (
        (listing_type = 'sale' AND price IS NOT NULL)
        OR (listing_type = 'rent' AND rent_per_month IS NOT NULL)
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_properties_updated_at ON properties;
CREATE TRIGGER trg_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS amenities (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  icon_key VARCHAR(40) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_amenities (
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, amenity_id)
);

CREATE TABLE IF NOT EXISTS property_amenities (
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (property_id, amenity_id)
);

CREATE TABLE IF NOT EXISTS rentals (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  monthly_rent NUMERIC(14, 2),
  security_deposit NUMERIC(14, 2),
  maintenance_charges NUMERIC(14, 2),
  maintenance_included BOOLEAN NOT NULL DEFAULT FALSE,
  city VARCHAR(120) NOT NULL,
  locality VARCHAR(160) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  property_type VARCHAR(32) NOT NULL,
  bhk INT,
  carpet_area NUMERIC(14, 2),
  furnished_status VARCHAR(20) NOT NULL DEFAULT 'unfurnished',
  tenant_preference VARCHAR(24) NOT NULL DEFAULT 'any',
  available_from DATE,
  lease_duration VARCHAR(40) NOT NULL DEFAULT '11 months',
  notice_period VARCHAR(40) NOT NULL DEFAULT '',
  parking VARCHAR(40) NOT NULL DEFAULT 'NA',
  pets_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  smoking_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  rental_model VARCHAR(20) NOT NULL DEFAULT 'long_term',
  nightly_rate NUMERIC(14, 2),
  weekly_rate NUMERIC(14, 2),
  cleaning_fee NUMERIC(14, 2),
  service_fee NUMERIC(14, 2),
  seats_available INT,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  virtual_tour_url TEXT NOT NULL DEFAULT '',
  posted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rentals_property_type_check'
  ) THEN
    ALTER TABLE rentals
      ADD CONSTRAINT rentals_property_type_check
      CHECK (property_type IN (
        'Apartment',
        'Villa',
        'Plotted',
        'Commercial',
        'Independent House',
        'Studio',
        'Duplex',
        'Shared Room'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rentals_furnished_status_check'
  ) THEN
    ALTER TABLE rentals
      ADD CONSTRAINT rentals_furnished_status_check
      CHECK (furnished_status IN ('unfurnished', 'semi', 'full'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rentals_tenant_preference_check'
  ) THEN
    ALTER TABLE rentals
      ADD CONSTRAINT rentals_tenant_preference_check
      CHECK (tenant_preference IN ('family', 'bachelor', 'company', 'students', 'any'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rentals_model_check'
  ) THEN
    ALTER TABLE rentals
      ADD CONSTRAINT rentals_model_check
      CHECK (rental_model IN ('long_term', 'short_term', 'co_living'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rental_amenities (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_property_amenities (
  rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  amenity_id BIGINT NOT NULL REFERENCES rental_amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (rental_id, amenity_id)
);

CREATE TABLE IF NOT EXISTS rental_leads (
  id BIGSERIAL PRIMARY KEY,
  rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_bookings (
  id BIGSERIAL PRIMARY KEY,
  rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_price NUMERIC(14, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rental_bookings_status_check'
  ) THEN
    ALTER TABLE rental_bookings
      ADD CONSTRAINT rental_bookings_status_check
      CHECK (status IN ('pending', 'confirmed', 'cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS saved_rentals (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, rental_id)
);

CREATE TABLE IF NOT EXISTS saved_properties (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  lead_type VARCHAR(24) NOT NULL DEFAULT 'general',
  requester_name VARCHAR(120) NOT NULL DEFAULT '',
  requester_phone VARCHAR(32) NOT NULL DEFAULT '',
  requester_email VARCHAR(190) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_type_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_lead_type_check
      CHECK (lead_type IN ('general', 'schedule_visit', 'contact_seller', 'make_offer', 'fraud_report'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS commission (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agent_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.50,
  commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_status_check'
  ) THEN
    ALTER TABLE commission
      ADD CONSTRAINT commission_status_check
      CHECK (status IN ('pending', 'paid'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS listing_promotions (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  promotion_type VARCHAR(24) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listing_promotions_type_check'
  ) THEN
    ALTER TABLE listing_promotions
      ADD CONSTRAINT listing_promotions_type_check
      CHECK (promotion_type IN ('featured', 'verification_badge', 'top_search', 'boost'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_price_history_market (
  id BIGSERIAL PRIMARY KEY,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  previous_price NUMERIC(14, 2),
  next_price NUMERIC(14, 2) NOT NULL,
  currency_code VARCHAR(8) NOT NULL DEFAULT 'INR',
  reason VARCHAR(160) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS companies_verified_idx
  ON companies (is_verified, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_company_idx
  ON projects (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_status_idx
  ON projects (status);
CREATE INDEX IF NOT EXISTS projects_construction_last_updated_idx
  ON projects (construction_last_updated_at DESC);
CREATE INDEX IF NOT EXISTS project_construction_updates_project_idx
  ON project_construction_updates (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_construction_updates_status_idx
  ON project_construction_updates (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_company_idx
  ON properties (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_project_idx
  ON properties (project_id);
CREATE INDEX IF NOT EXISTS properties_listing_idx
  ON properties (listing_type);
CREATE INDEX IF NOT EXISTS rentals_city_idx
  ON rentals (city);
CREATE INDEX IF NOT EXISTS rentals_locality_idx
  ON rentals (locality);
CREATE INDEX IF NOT EXISTS rentals_rent_idx
  ON rentals (monthly_rent);
CREATE INDEX IF NOT EXISTS rentals_bhk_idx
  ON rentals (bhk);
CREATE INDEX IF NOT EXISTS rentals_type_idx
  ON rentals (property_type);
CREATE INDEX IF NOT EXISTS rentals_model_idx
  ON rentals (rental_model);
CREATE INDEX IF NOT EXISTS rentals_verified_idx
  ON rentals (is_verified, created_at DESC);
CREATE INDEX IF NOT EXISTS rentals_featured_idx
  ON rentals (is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS rentals_view_idx
  ON rentals (view_count DESC);
CREATE INDEX IF NOT EXISTS rental_leads_rental_idx
  ON rental_leads (rental_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_bookings_rental_idx
  ON rental_bookings (rental_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_rentals_user_idx
  ON saved_rentals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_city_idx
  ON properties (city);
CREATE INDEX IF NOT EXISTS properties_locality_idx
  ON properties (locality);
CREATE INDEX IF NOT EXISTS properties_price_idx
  ON properties (price);
CREATE INDEX IF NOT EXISTS properties_price_per_sqft_idx
  ON properties (price_per_sqft);
CREATE INDEX IF NOT EXISTS properties_bedrooms_idx
  ON properties (bedrooms);
CREATE INDEX IF NOT EXISTS properties_type_idx
  ON properties (property_type);
CREATE INDEX IF NOT EXISTS properties_verified_idx
  ON properties (is_verified, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_featured_idx
  ON properties (is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_view_count_idx
  ON properties (view_count DESC);
CREATE INDEX IF NOT EXISTS saved_properties_user_idx
  ON saved_properties (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_properties_property_idx
  ON saved_properties (property_id);
CREATE INDEX IF NOT EXISTS leads_property_idx
  ON leads (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_user_idx
  ON leads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_property_idx
  ON commission (property_id);
CREATE INDEX IF NOT EXISTS commission_agent_idx
  ON commission (agent_id, status);
CREATE INDEX IF NOT EXISTS listing_promotions_property_idx
  ON listing_promotions (property_id);
CREATE INDEX IF NOT EXISTS listing_promotions_type_idx
  ON listing_promotions (promotion_type, status);
CREATE INDEX IF NOT EXISTS property_price_history_market_property_idx
  ON property_price_history_market (property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS owner_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(3, 2),
  total_listings INT NOT NULL DEFAULT 0,
  subscription_plan VARCHAR(40) NOT NULL DEFAULT 'free',
  display_name VARCHAR(140) NOT NULL DEFAULT '',
  profile_photo_url TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  bank_name VARCHAR(120) NOT NULL DEFAULT '',
  bank_account VARCHAR(120) NOT NULL DEFAULT '',
  bank_ifsc VARCHAR(40) NOT NULL DEFAULT '',
  kyc_document_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_name VARCHAR(120) NOT NULL,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  provider VARCHAR(60),
  payment_reference VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boosts (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id BIGINT REFERENCES properties(id) ON DELETE CASCADE,
  rental_id BIGINT REFERENCES rentals(id) ON DELETE CASCADE,
  listing_type VARCHAR(12) NOT NULL DEFAULT 'property',
  start_date DATE,
  end_date DATE,
  boost_type VARCHAR(80) NOT NULL,
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (listing_type = 'property' AND property_id IS NOT NULL)
    OR (listing_type = 'rental' AND rental_id IS NOT NULL)
  )
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE rental_leads
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS owner_profiles_user_idx ON owner_profiles(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON subscriptions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS boosts_owner_idx ON boosts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties(posted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS rentals_owner_idx ON rentals(posted_by, created_at DESC);

INSERT INTO companies (
  id,
  code,
  name,
  company_type,
  logo_url,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  bc.id,
  bc.company_code,
  bc.name,
  bc.company_type,
  bc.logo_url,
  bc.created_by_user_id,
  bc.created_at,
  bc.updated_at
FROM builder_companies bc
ON CONFLICT (id)
DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  company_type = EXCLUDED.company_type,
  logo_url = EXCLUDED.logo_url,
  updated_at = NOW();

SELECT setval(
  pg_get_serial_sequence('companies', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM companies), 1), 1),
  TRUE
);

INSERT INTO amenities (name, slug) VALUES
  ('Parking', 'parking'),
  ('Lift', 'lift'),
  ('Power Backup', 'power-backup'),
  ('Security', 'security'),
  ('CCTV', 'cctv'),
  ('Gym', 'gym'),
  ('Swimming Pool', 'swimming-pool'),
  ('Garden', 'garden'),
  ('Children Play Area', 'children-play-area'),
  ('Clubhouse', 'clubhouse'),
  ('Community Hall', 'community-hall'),
  ('Water Supply', 'water-supply'),
  ('Gas Pipeline', 'gas-pipeline'),
  ('Internet/WiFi', 'internet-wifi'),
  ('Rainwater Harvesting', 'rainwater-harvesting'),
  ('Waste Management', 'waste-management'),
  ('Near School', 'near-school'),
  ('Near Hospital', 'near-hospital'),
  ('Near Market', 'near-market'),
  ('Near Metro/Bus', 'near-metro-bus'),
  ('Smart Home', 'smart-home'),
  ('EV Charging', 'ev-charging'),
  ('Pet Friendly', 'pet-friendly'),
  ('Wheelchair Friendly', 'wheelchair-friendly')
ON CONFLICT (slug)
DO UPDATE SET name = EXCLUDED.name;

INSERT INTO rental_amenities (name, slug) VALUES
  ('Lift', 'lift'),
  ('Parking', 'parking'),
  ('Power Backup', 'power-backup'),
  ('Swimming Pool', 'swimming-pool'),
  ('Gym', 'gym'),
  ('WiFi', 'wifi'),
  ('AC', 'ac'),
  ('Modular Kitchen', 'modular-kitchen'),
  ('Geyser', 'geyser'),
  ('CCTV', 'cctv'),
  ('Balcony', 'balcony'),
  ('Near Metro', 'near-metro'),
  ('Near Office Hubs', 'near-office-hubs'),
  ('Near College', 'near-college')
ON CONFLICT (slug)
DO UPDATE SET name = EXCLUDED.name;
