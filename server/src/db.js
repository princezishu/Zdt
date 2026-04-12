import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_PORT'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

const DEFAULT_AMENITIES = [
  'Parking',
  'Lift',
  'Power Backup',
  'Security',
  'CCTV',
  'Gym',
  'Swimming Pool',
  'Garden',
  'Children Play Area',
  'Clubhouse',
  'Community Hall',
  'Water Supply',
  'Gas Pipeline',
  'Internet/WiFi',
  'Rainwater Harvesting',
  'Waste Management',
  'Near School',
  'Near Hospital',
  'Near Market',
  'Near Metro/Bus',
  'Smart Home',
  'EV Charging',
  'Pet Friendly',
  'Wheelchair Friendly',
];

const DEFAULT_RENTAL_AMENITIES = [
  'Lift',
  'Parking',
  'Power Backup',
  'Swimming Pool',
  'Gym',
  'WiFi',
  'AC',
  'Modular Kitchen',
  'Geyser',
  'CCTV',
  'Balcony',
  'Near Metro',
  'Near Office Hubs',
  'Near College',
];

const ACCOUNT_TYPES = ['individual', 'dealer', 'builder', 'corporate'];
const SUBSCRIPTION_TIERS = ['free', 'pro', 'premium', 'enterprise'];
const LISTING_LIFECYCLE_STATUSES = [
  'draft',
  'pending_review',
  'needs_changes',
  'approved',
  'flagged',
  'suspended',
  'archived',
  'sold',
  'rented',
];

if (missingEnv.length > 0) {
  console.error(`Missing env variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

function readBooleanEnv(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

const dbSslEnabled = readBooleanEnv('DB_SSL', false);
const dbSslRejectUnauthorized = readBooleanEnv('DB_SSL_REJECT_UNAUTHORIZED', true);
const dbSslCa = String(process.env.DB_SSL_CA || '').trim();
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
};

if (dbSslEnabled) {
  dbConfig.ssl = {
    rejectUnauthorized: dbSslRejectUnauthorized,
  };
  if (dbSslCa) {
    dbConfig.ssl.ca = dbSslCa.replace(/\\n/g, '\n');
  }
}

const dbPoolMax = Math.max(5, Math.min(50,
  Number(process.env.DB_POOL_MAX || 20) || 20
));

export const pool = new Pool({
  ...dbConfig,
  max: dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,
});

export async function pingDb() {
  await pool.query('SELECT 1');
}

export async function reactivateExpiredTemporaryDeactivations(limit = 25) {
  const expiredRows = await pool.query(
    `
      SELECT id
      FROM users
      WHERE is_active = FALSE
        AND deactivated_until IS NOT NULL
        AND deactivated_until <= NOW()
      ORDER BY deactivated_until ASC
      LIMIT $1
    `,
    [limit]
  );

  let reactivated = 0;
  for (const row of expiredRows.rows) {
    try {
      await pool.query(
        `
          UPDATE users
          SET is_active = TRUE,
              deactivated_until = NULL
          WHERE id = $1
            AND is_active = FALSE
            AND deactivated_until IS NOT NULL
            AND deactivated_until <= NOW()
        `,
        [row.id]
      );
      reactivated += 1;
    } catch {
      // Seat caps might block reactivation (admins/team members). Keep deactivated until main admin resolves.
    }
  }

  return { reactivated };
}

export async function ensureAuthTables() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(32),
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      account_type VARCHAR(20) NOT NULL DEFAULT 'individual',
      subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
      is_main_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
      managed_auth_provider VARCHAR(40),
      managed_auth_subject VARCHAR(255),
      managed_auth_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      managed_auth_only BOOLEAN NOT NULL DEFAULT FALSE,
      managed_auth_last_sign_in_at TIMESTAMPTZ,
      deactivated_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'individual',
      ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS is_main_admin BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS managed_auth_provider VARCHAR(40),
      ADD COLUMN IF NOT EXISTS managed_auth_subject VARCHAR(255),
      ADD COLUMN IF NOT EXISTS managed_auth_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS managed_auth_only BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS managed_auth_last_sign_in_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deactivated_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;');

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
    ) THEN
      ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('user', 'owner', 'agent', 'builder', 'team_member', 'admin'));
    END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name = 'status'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscriptions_status_check'
      ) THEN
        ALTER TABLE subscriptions
          ADD CONSTRAINT subscriptions_status_check
          CHECK (status IN ('active', 'cancelled', 'expired', 'pending_payment'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'property_requests'
          AND column_name = 'lifecycle_status'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_lifecycle_status_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_lifecycle_status_check
          CHECK (
            lifecycle_status IN (
              'draft',
              'pending_review',
              'needs_changes',
              'approved',
              'flagged',
              'suspended',
              'archived',
              'sold',
              'rented'
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'property_requests'
          AND column_name = 'risk_score'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_risk_score_range_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_risk_score_range_check
          CHECK (risk_score >= 0 AND risk_score <= 100);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'property_requests'
          AND column_name = 'engagement_score'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_engagement_score_non_negative_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_engagement_score_non_negative_check
          CHECK (engagement_score >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'property_requests'
          AND column_name = 'boost_weight'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_boost_weight_non_negative_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_boost_weight_non_negative_check
          CHECK (boost_weight >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_account_type_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_account_type_check
          CHECK (account_type IN ('individual', 'dealer', 'builder', 'corporate'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_subscription_tier_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_subscription_tier_check
          CHECK (subscription_tier IN ('free', 'pro', 'premium', 'enterprise'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_main_admin_role_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_main_admin_role_check
          CHECK ((NOT is_main_admin) OR role = 'admin');
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_single_main_admin_idx
      ON users (is_main_admin)
      WHERE is_main_admin = TRUE;
  `);

  await pool.query(`
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
          RAISE EXCEPTION 'Admin account limit reached (maximum 2)'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_users_admin_limit ON users;');
  await pool.query(`
    CREATE TRIGGER trg_users_admin_limit
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION enforce_admin_limit();
  `);

  await pool.query(`
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
          RAISE EXCEPTION 'Team member account limit reached (maximum 5)'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_users_team_member_limit ON users;');
  await pool.query(`
    CREATE TRIGGER trg_users_team_member_limit
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION enforce_team_member_limit();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      otp_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_2fa_challenges (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_hash VARCHAR(128) NOT NULL UNIQUE,
      otp_hash VARCHAR(128) NOT NULL,
      device_id VARCHAR(120) NOT NULL,
      requested_ip VARCHAR(64) NOT NULL DEFAULT '',
      requested_user_agent VARCHAR(255) NOT NULL DEFAULT '',
      attempts SMALLINT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE main_admin_profile_media
      ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS storage_visibility VARCHAR(16) NOT NULL DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'main_admin_profile_media_storage_visibility_check'
      ) THEN
        ALTER TABLE main_admin_profile_media
          ADD CONSTRAINT main_admin_profile_media_storage_visibility_check
          CHECK (storage_visibility IN ('public', 'private'));
      END IF;
    END $$;
  `);

  await pool.query(`
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
      submission_ip VARCHAR(64) NOT NULL DEFAULT '',
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
      lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
      workflow_stage VARCHAR(24) NOT NULL DEFAULT 'Pending Approval'
        CHECK (workflow_stage IN ('Draft', 'Pending Approval', 'Approved', 'Rejected')),
      moderation_notes TEXT NOT NULL DEFAULT '',
      risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      risk_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
      engagement_score NUMERIC(12,4) NOT NULL DEFAULT 0,
      boost_weight NUMERIC(12,4) NOT NULL DEFAULT 0,
      ranking_score NUMERIC(12,4) NOT NULL DEFAULT 0,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      internal_notes TEXT NOT NULL DEFAULT '',
      is_fake BOOLEAN NOT NULL DEFAULT FALSE,
      is_removed BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE property_requests
      ADD COLUMN IF NOT EXISTS submission_ip VARCHAR(64) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
      ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(24) NOT NULL DEFAULT 'Pending Approval',
      ADD COLUMN IF NOT EXISTS moderation_notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS risk_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS engagement_score NUMERIC(12,4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS boost_weight NUMERIC(12,4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ranking_score NUMERIC(12,4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS assigned_task_type VARCHAR(24),
      ADD COLUMN IF NOT EXISTS assigned_task_query TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS assigned_by_admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_workflow_stage_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_workflow_stage_check
          CHECK (workflow_stage IN ('Draft', 'Pending Approval', 'Approved', 'Rejected'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'property_requests_assigned_task_type_check'
      ) THEN
        ALTER TABLE property_requests
          ADD CONSTRAINT property_requests_assigned_task_type_check
          CHECK (
            assigned_task_type IS NULL
            OR assigned_task_type IN ('call_user', 'add_property', 'handle_query')
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE property_requests
    SET workflow_stage = CASE
      WHEN listing_status = 'Rejected' THEN 'Rejected'
      WHEN listing_status IN ('Approved', 'Sold', 'Rented') THEN 'Approved'
      ELSE 'Pending Approval'
    END
    WHERE workflow_stage IS NULL
      OR workflow_stage NOT IN ('Draft', 'Pending Approval', 'Approved', 'Rejected');
  `);

  await pool.query(`
    UPDATE property_requests
    SET lifecycle_status = CASE
      WHEN is_removed = TRUE THEN 'archived'
      WHEN listing_status = 'Sold' THEN 'sold'
      WHEN listing_status = 'Rented' THEN 'rented'
      WHEN listing_status = 'Approved' THEN 'approved'
      WHEN listing_status = 'Rejected' THEN 'needs_changes'
      ELSE 'pending_review'
    END
    WHERE lifecycle_status IS NULL
       OR lifecycle_status NOT IN (
         'draft',
         'pending_review',
         'needs_changes',
         'approved',
         'flagged',
         'suspended',
         'archived',
         'sold',
         'rented'
       );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_application_status_history (
      id BIGSERIAL PRIMARY KEY,
      career_application_id BIGINT NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
      changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      previous_status VARCHAR(24),
      next_status VARCHAR(24) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20) NOT NULL DEFAULT '',
      action_key VARCHAR(80) NOT NULL,
      entity_type VARCHAR(32) NOT NULL,
      entity_id BIGINT,
      request_reference VARCHAR(40),
      ip_address VARCHAR(64) NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE activity_logs
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20) NOT NULL DEFAULT '',
      action VARCHAR(120) NOT NULL,
      target_type VARCHAR(48) NOT NULL,
      target_id BIGINT,
      request_reference VARCHAR(40),
      ip_address VARCHAR(64) NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      role_key VARCHAR(20) PRIMARY KEY,
      title VARCHAR(60) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      uuid_id UUID NOT NULL DEFAULT gen_random_uuid()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      permission_key VARCHAR(80) PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      module_name VARCHAR(40) NOT NULL DEFAULT 'general',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      uuid_id UUID NOT NULL DEFAULT gen_random_uuid()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id BIGSERIAL PRIMARY KEY,
      role VARCHAR(20) NOT NULL,
      permission_key VARCHAR(80) NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
      main_admin_only BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      uuid_id UUID NOT NULL DEFAULT gen_random_uuid(),
      CONSTRAINT role_permissions_unique UNIQUE (role, permission_key, main_admin_only)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_key VARCHAR(20) NOT NULL REFERENCES roles(role_key) ON DELETE RESTRICT,
      assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      assignment_source VARCHAR(24) NOT NULL DEFAULT 'manual'
        CHECK (assignment_source IN ('manual', 'legacy_bridge', 'system')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    ALTER TABLE roles
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
  `);

  await pool.query(`
    ALTER TABLE permissions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
  `);

  await pool.query(`
    ALTER TABLE role_permissions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
  `);

  await pool.query(`
    ALTER TABLE user_roles
      ADD COLUMN IF NOT EXISTS assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(24) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_roles_assignment_source_check'
      ) THEN
        ALTER TABLE user_roles
          ADD CONSTRAINT user_roles_assignment_source_check
          CHECK (assignment_source IN ('manual', 'legacy_bridge', 'system'));
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE roles
    SET uuid_id = gen_random_uuid()
    WHERE uuid_id IS NULL;
  `);

  await pool.query(`
    UPDATE permissions
    SET uuid_id = gen_random_uuid()
    WHERE uuid_id IS NULL;
  `);

  await pool.query(`
    UPDATE role_permissions
    SET uuid_id = gen_random_uuid()
    WHERE uuid_id IS NULL;
  `);

  await pool.query(`
    ALTER TABLE roles
      ALTER COLUMN uuid_id SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE permissions
      ALTER COLUMN uuid_id SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE role_permissions
      ALTER COLUMN uuid_id SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE role_permissions
      DROP CONSTRAINT IF EXISTS role_permissions_role_check;
  `);

  await pool.query(`
    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_role_check
      CHECK (role IN ('user', 'team_member', 'admin', 'main_admin'));
  `);

  await pool.query(`
    INSERT INTO roles (role_key, title, description)
    VALUES
      ('main_admin', 'Main Admin', 'Full system access and irreversible controls'),
      ('admin', 'Admin', 'Limited high-control platform operator'),
      ('team_member', 'Team Member', 'Operational team workflow user'),
      ('owner', 'Owner', 'Property owner account with owner panel access'),
      ('agent', 'Agent', 'Agent account for managed listing workflows'),
      ('builder', 'Builder', 'Builder/dealer company account'),
      ('user', 'User', 'Standard platform user')
    ON CONFLICT (role_key)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      updated_at = NOW(),
      deleted_at = NULL
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'role_permissions_role_fkey'
      ) THEN
        ALTER TABLE role_permissions
          ADD CONSTRAINT role_permissions_role_fkey
          FOREIGN KEY (role)
          REFERENCES roles(role_key)
          ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      plan_id VARCHAR(40) PRIMARY KEY,
      plan_name VARCHAR(80) NOT NULL,
      tier VARCHAR(20) NOT NULL,
      monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      yearly_price NUMERIC(12,2),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscription_plans_tier_check'
      ) THEN
        ALTER TABLE subscription_plans
          ADD CONSTRAINT subscription_plans_tier_check
          CHECK (tier IN ('free', 'pro', 'premium', 'enterprise'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_features (
      id BIGSERIAL PRIMARY KEY,
      plan_id VARCHAR(40) NOT NULL REFERENCES subscription_plans(plan_id) ON DELETE CASCADE,
      feature_key VARCHAR(80) NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      limit_value INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT plan_features_unique UNIQUE (plan_id, feature_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id VARCHAR(40) NOT NULL,
      subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE,
      features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      listing_quota INT NOT NULL DEFAULT 10,
      boost_credits INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS provider VARCHAR(60) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120) NOT NULL DEFAULT '';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscriptions_tier_check'
      ) THEN
        ALTER TABLE subscriptions
          ADD CONSTRAINT subscriptions_tier_check
          CHECK (subscription_tier IN ('free', 'pro', 'premium', 'enterprise'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscriptions_plan_id_fkey'
      ) THEN
        ALTER TABLE subscriptions
          ADD CONSTRAINT subscriptions_plan_id_fkey
          FOREIGN KEY (plan_id)
          REFERENCES subscription_plans(plan_id)
          ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listing_analytics_events (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(24) NOT NULL,
      event_value NUMERIC(14,2),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE listing_analytics_events
      DROP CONSTRAINT IF EXISTS listing_analytics_events_type_check;
  `);

  await pool.query(`
    ALTER TABLE listing_analytics_events
      ADD CONSTRAINT listing_analytics_events_type_check
      CHECK (
        event_type IN (
          'view',
          'save',
          'contact_click',
          'phone_unlock',
          'call_click',
          'visit_request',
          'premium_cta',
          'conversion',
          'price_change'
        )
      );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_price_history (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      previous_price NUMERIC(14,2),
      next_price NUMERIC(14,2) NOT NULL,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'INR',
      reason VARCHAR(160) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_analytics_daily (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      day_date DATE NOT NULL,
      views_count INT NOT NULL DEFAULT 0,
      saves_count INT NOT NULL DEFAULT 0,
      contact_clicks_count INT NOT NULL DEFAULT 0,
      visit_requests_count INT NOT NULL DEFAULT 0,
      conversions_count INT NOT NULL DEFAULT 0,
      price_changes_count INT NOT NULL DEFAULT 0,
      conversion_ratio NUMERIC(8,2) NOT NULL DEFAULT 0,
      average_price NUMERIC(14,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT property_analytics_daily_unique UNIQUE (property_request_id, day_date)
    );
  `);

  await pool.query(`
    ALTER TABLE property_analytics_daily
      ADD COLUMN IF NOT EXISTS phone_unlocks_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS call_clicks_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS premium_cta_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS brochure_requests_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS price_sheet_requests_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loan_help_requests_count INT NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_analytics (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_date DATE NOT NULL,
      listings_created INT NOT NULL DEFAULT 0,
      total_views INT NOT NULL DEFAULT 0,
      total_saves INT NOT NULL DEFAULT 0,
      total_contacts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_analytics_unique UNIQUE (user_id, day_date)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_analytics (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      day_date DATE NOT NULL,
      leads_generated INT NOT NULL DEFAULT 0,
      lead_to_visit_ratio NUMERIC(8,2) NOT NULL DEFAULT 0,
      lead_to_sale_ratio NUMERIC(8,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT lead_analytics_unique UNIQUE (property_request_id, day_date)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_favorite_listings (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_favorite_listings_unique UNIQUE (user_id, property_request_id)
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        INNER JOIN pg_class t
          ON t.oid = c.conrelid
        WHERE t.relname = 'chat_conversations'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%conversation_type%'
      LOOP
        EXECUTE format('ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS %I', constraint_name);
      END LOOP;
    END
    $$;
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD CONSTRAINT chat_conversations_conversation_type_check
    CHECK (conversation_type IN ('team_support', 'property_owner', 'builder_company'));
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION mirror_activity_log_to_audit_logs()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO audit_logs (
        actor_id,
        actor_role,
        action,
        target_type,
        target_id,
        request_reference,
        ip_address,
        metadata,
        created_at
      )
      VALUES (
        NEW.actor_user_id,
        NEW.actor_role,
        NEW.action_key,
        NEW.entity_type,
        NEW.entity_id,
        NEW.request_reference,
        COALESCE(NEW.ip_address, ''),
        COALESCE(NEW.metadata, '{}'::jsonb),
        NEW.created_at
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_property_request_transition()
    RETURNS TRIGGER AS $$
    DECLARE
      old_status TEXT;
      next_status TEXT;
      next_listing_status TEXT;
      next_workflow_stage TEXT;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        next_status := COALESCE(NEW.lifecycle_status, 'pending_review');
        old_status := next_status;
      ELSE
        old_status := COALESCE(OLD.lifecycle_status, 'pending_review');
        next_status := COALESCE(NEW.lifecycle_status, old_status);
      END IF;

      IF TG_OP <> 'INSERT' AND next_status <> old_status THEN
        IF old_status = 'draft' AND next_status NOT IN ('pending_review', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status = 'pending_review' AND next_status NOT IN ('needs_changes', 'approved', 'flagged', 'suspended', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status = 'needs_changes' AND next_status NOT IN ('pending_review', 'suspended', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status = 'approved' AND next_status NOT IN ('sold', 'rented', 'flagged', 'suspended', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status = 'flagged' AND next_status NOT IN ('pending_review', 'approved', 'suspended', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status = 'suspended' AND next_status NOT IN ('pending_review', 'archived') THEN
          RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', old_status, next_status
            USING ERRCODE = 'P0001';
        ELSIF old_status IN ('archived', 'sold', 'rented') AND next_status <> old_status THEN
          RAISE EXCEPTION 'Lifecycle status % is terminal', old_status
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF COALESCE(NEW.is_removed, FALSE) = TRUE OR NEW.deleted_at IS NOT NULL THEN
        next_status := 'archived';
      END IF;

      next_listing_status := CASE
        WHEN NEW.request_type NOT IN ('sell', 'rent') THEN 'Pending'
        WHEN next_status = 'approved' THEN 'Approved'
        WHEN next_status = 'needs_changes' THEN 'Rejected'
        WHEN next_status = 'sold' THEN 'Sold'
        WHEN next_status = 'rented' THEN 'Rented'
        ELSE 'Pending'
      END;

      next_workflow_stage := CASE
        WHEN next_status = 'draft' THEN 'Draft'
        WHEN next_status IN ('approved', 'sold', 'rented') THEN 'Approved'
        WHEN next_status = 'needs_changes' THEN 'Rejected'
        ELSE 'Pending Approval'
      END;

      NEW.lifecycle_status := next_status;
      NEW.listing_status := next_listing_status;
      NEW.workflow_stage := next_workflow_stage;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION refresh_property_request_ranking()
    RETURNS TRIGGER AS $$
    DECLARE
      freshness NUMERIC := 0;
      trust_factor NUMERIC := 0;
      age_days NUMERIC := 0;
    BEGIN
      IF NEW.deleted_at IS NOT NULL
         OR NEW.lifecycle_status IN ('archived', 'sold', 'rented', 'suspended') THEN
        NEW.ranking_score = 0;
        RETURN NEW;
      END IF;

      age_days = EXTRACT(EPOCH FROM (NOW() - COALESCE(NEW.created_at, NOW()))) / 86400;
      freshness = GREATEST(0, 30 - age_days);

      trust_factor = CASE
        WHEN COALESCE(NEW.risk_score, 0) <= 20 THEN 25
        WHEN COALESCE(NEW.risk_score, 0) <= 40 THEN 12
        WHEN COALESCE(NEW.risk_score, 0) <= 60 THEN 4
        ELSE -12
      END;

      NEW.ranking_score =
        COALESCE(NEW.boost_weight, 0)
        + COALESCE(NEW.engagement_score, 0)
        + freshness
        + trust_factor;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_listing_quota()
    RETURNS TRIGGER AS $$
    DECLARE
      tier TEXT;
      max_listings INTEGER;
      active_listing_count INTEGER;
    BEGIN
      IF NEW.submitted_by_user_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.deleted_at IS NOT NULL
         OR NEW.lifecycle_status IN ('archived', 'sold', 'rented') THEN
        RETURN NEW;
      END IF;

      SELECT subscription_tier INTO tier
      FROM users
      WHERE id = NEW.submitted_by_user_id
      LIMIT 1;

      tier = COALESCE(tier, 'free');
      max_listings = CASE tier
        WHEN 'enterprise' THEN 1000
        WHEN 'premium' THEN 200
        WHEN 'pro' THEN 50
        ELSE 10
      END;

      SELECT COUNT(*) INTO active_listing_count
      FROM property_requests
      WHERE submitted_by_user_id = NEW.submitted_by_user_id
        AND deleted_at IS NULL
        AND lifecycle_status IN (
          'draft',
          'pending_review',
          'needs_changes',
          'approved',
          'flagged',
          'suspended'
        )
        AND id <> COALESCE(NEW.id, -1);

      IF active_listing_count >= max_listings THEN
        RAISE EXCEPTION
          'Listing quota reached for % tier (max % active listings)',
          tier,
          max_listings
          USING ERRCODE = 'P0001';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION sync_user_roles_from_users()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE user_roles
      SET deleted_at = NOW(),
          updated_at = NOW()
      WHERE user_id = NEW.id
        AND assignment_source = 'legacy_bridge'
        AND role_key <> NEW.role
        AND role_key <> 'main_admin'
        AND deleted_at IS NULL;

      INSERT INTO user_roles (
        user_id,
        role_key,
        assigned_by_user_id,
        assignment_source,
        deleted_at
      )
      VALUES (
        NEW.id,
        NEW.role,
        NEW.id,
        'legacy_bridge',
        NULL
      )
      ON CONFLICT (user_id, role_key) WHERE deleted_at IS NULL
      DO UPDATE SET
        deleted_at = NULL,
        updated_at = NOW(),
        assignment_source = 'legacy_bridge';

      IF NEW.is_main_admin THEN
        INSERT INTO user_roles (
          user_id,
          role_key,
          assigned_by_user_id,
          assignment_source,
          deleted_at
        )
        VALUES (
          NEW.id,
          'main_admin',
          NEW.id,
          'legacy_bridge',
          NULL
        )
        ON CONFLICT (user_id, role_key) WHERE deleted_at IS NULL
        DO UPDATE SET
          deleted_at = NULL,
          updated_at = NOW(),
          assignment_source = 'legacy_bridge';
      ELSE
        UPDATE user_roles
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE user_id = NEW.id
          AND role_key = 'main_admin'
          AND assignment_source = 'legacy_bridge'
          AND deleted_at IS NULL;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_requests_updated_at ON property_requests;');
  await pool.query(`
    CREATE TRIGGER trg_property_requests_updated_at
    BEFORE UPDATE ON property_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_requests_transition_guard ON property_requests;');
  await pool.query(`
    CREATE TRIGGER trg_property_requests_transition_guard
    BEFORE INSERT OR UPDATE OF lifecycle_status, listing_status, request_type, is_removed, deleted_at
    ON property_requests
    FOR EACH ROW
    EXECUTE FUNCTION enforce_property_request_transition();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_requests_ranking_score ON property_requests;');
  await pool.query(`
    CREATE TRIGGER trg_property_requests_ranking_score
    BEFORE INSERT OR UPDATE OF boost_weight, engagement_score, risk_score, lifecycle_status, deleted_at
    ON property_requests
    FOR EACH ROW
    EXECUTE FUNCTION refresh_property_request_ranking();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_requests_listing_quota ON property_requests;');
  await pool.query(`
    CREATE TRIGGER trg_property_requests_listing_quota
    BEFORE INSERT OR UPDATE OF submitted_by_user_id, lifecycle_status, deleted_at
    ON property_requests
    FOR EACH ROW
    EXECUTE FUNCTION enforce_listing_quota();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_career_applications_updated_at ON career_applications;');
  await pool.query(`
    CREATE TRIGGER trg_career_applications_updated_at
    BEFORE UPDATE ON career_applications
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;');
  await pool.query(`
    CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_main_admin_profile_media_updated_at ON main_admin_profile_media;');
  await pool.query(`
    CREATE TRIGGER trg_main_admin_profile_media_updated_at
    BEFORE UPDATE ON main_admin_profile_media
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_chat_conversations_updated_at ON chat_conversations;');
  await pool.query(`
    CREATE TRIGGER trg_chat_conversations_updated_at
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_chat_message_receipts_updated_at ON chat_message_receipts;');
  await pool.query(`
    CREATE TRIGGER trg_chat_message_receipts_updated_at
    BEFORE UPDATE ON chat_message_receipts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;');
  await pool.query(`
    CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_activity_logs_to_audit ON activity_logs;');
  await pool.query(`
    CREATE TRIGGER trg_activity_logs_to_audit
    AFTER INSERT ON activity_logs
    FOR EACH ROW
    EXECUTE FUNCTION mirror_activity_log_to_audit_logs();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON subscription_plans;');
  await pool.query(`
    CREATE TRIGGER trg_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_plan_features_updated_at ON plan_features;');
  await pool.query(`
    CREATE TRIGGER trg_plan_features_updated_at
    BEFORE UPDATE ON plan_features
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_analytics_daily_updated_at ON property_analytics_daily;');
  await pool.query(`
    CREATE TRIGGER trg_property_analytics_daily_updated_at
    BEFORE UPDATE ON property_analytics_daily
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_user_analytics_updated_at ON user_analytics;');
  await pool.query(`
    CREATE TRIGGER trg_user_analytics_updated_at
    BEFORE UPDATE ON user_analytics
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_lead_analytics_updated_at ON lead_analytics;');
  await pool.query(`
    CREATE TRIGGER trg_lead_analytics_updated_at
    BEFORE UPDATE ON lead_analytics
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;');
  await pool.query(`
    CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_permissions_updated_at ON permissions;');
  await pool.query(`
    CREATE TRIGGER trg_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON role_permissions;');
  await pool.query(`
    CREATE TRIGGER trg_role_permissions_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON user_roles;');
  await pool.query(`
    CREATE TRIGGER trg_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_users_sync_user_roles ON users;');
  await pool.query(`
    CREATE TRIGGER trg_users_sync_user_roles
    AFTER INSERT OR UPDATE OF role, is_main_admin ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_roles_from_users();
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_request_type ON property_requests(request_type);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_interaction_status ON property_requests(interaction_status);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_listing_status ON property_requests(listing_status);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_lifecycle_status ON property_requests(lifecycle_status);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_ranking_score ON property_requests(ranking_score DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_active_owner ON property_requests(submitted_by_user_id, created_at DESC) WHERE deleted_at IS NULL;'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_workflow_stage ON property_requests(workflow_stage);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_assisted_listing ON property_requests(assisted_listing);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_to_user ON property_requests(assigned_to_user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_task_type ON property_requests(assigned_task_type);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_requests_created_at ON property_requests(created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_career_applications_status ON career_applications(status);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user ON activity_logs(actor_user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_action_key ON activity_logs(action_key);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_ip_address ON activity_logs(ip_address, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_roles_title ON roles(title);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_name, permission_key);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role, permission_key);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_role_permissions_main_admin ON role_permissions(main_admin_only, role);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_uuid_id_unique ON roles(uuid_id);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_uuid_id_unique ON permissions(uuid_id);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_uuid_id_unique ON role_permissions(uuid_id);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role_active_unique ON user_roles(user_id, role_key) WHERE deleted_at IS NULL;'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON user_roles(user_id, deleted_at);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON user_roles(role_key, deleted_at);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by ON user_roles(assigned_by_user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions(user_id, is_active, end_date);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_single_active ON subscriptions(user_id) WHERE is_active = TRUE;'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_plan_features_plan_feature ON plan_features(plan_id, feature_key);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_listing_analytics_events_property_created ON listing_analytics_events(property_request_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_listing_analytics_events_type_created ON listing_analytics_events(event_type, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_price_history_property_created ON property_price_history(property_request_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_property_analytics_daily_day ON property_analytics_daily(day_date, property_request_id);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_analytics_day ON user_analytics(day_date, user_id);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_lead_analytics_day ON lead_analytics(day_date, property_request_id);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, revoked_at);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_managed_auth_identity_unique ON users(managed_auth_provider, managed_auth_subject) WHERE managed_auth_provider IS NOT NULL AND managed_auth_subject IS NOT NULL;'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_login_2fa_challenges_user_created ON login_2fa_challenges(user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_login_2fa_challenges_expires ON login_2fa_challenges(expires_at);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_profiles_country ON user_profiles(country);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_user_created ON main_admin_profile_media(user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_category ON main_admin_profile_media(category, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_storage_path ON main_admin_profile_media(storage_visibility, storage_path);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_user_created ON user_favorite_listings(user_id, created_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_property ON user_favorite_listings(property_request_id);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_conversations_requester ON chat_conversations(requester_user_id, updated_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON chat_conversations(owner_user_id, updated_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_conversations_type_status ON chat_conversations(conversation_type, status);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON chat_messages(conversation_id, created_at ASC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_sender_role ON chat_messages(conversation_id, sender_role, id DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_conversation_updated ON chat_message_receipts(conversation_id, updated_at DESC);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_message_receipts_user_updated ON chat_message_receipts(user_id, updated_at DESC);'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash_active ON user_sessions(token_hash) WHERE revoked_at IS NULL;'
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_career_applications_registration_number_unique ON career_applications(registration_number) WHERE registration_number <> '';"
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_phone_verification_otps_lookup ON phone_verification_otps(verification_token, phone);'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_phone_verification_otps_phone_created ON phone_verification_otps(phone, created_at DESC);'
  );

  const softDeleteTables = [
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'user_profiles',
    'main_admin_profile_media',
    'property_requests',
    'career_applications',
    'user_favorite_listings',
    'chat_conversations',
    'chat_messages',
    'builder_companies',
    'builder_projects',
    'companies',
    'projects',
    'properties',
    'amenities',
    'floors',
    'layout_files',
    'units',
    'layout_markers',
    'buildings',
    'rooms',
    'rent_payments',
    'material_vendors',
    'material_items',
    'site_promotions',
    'news_sources',
    'news_articles',
    'builder_sources',
    'project_announcements',
  ];

  for (const tableName of softDeleteTables) {
    await pool.query(`
      ALTER TABLE IF EXISTS ${tableName}
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
  }

  const uuidMigrationTargets = [
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'main_admin_profile_media',
    'property_requests',
    'chat_conversations',
    'chat_messages',
    'builder_company_banners',
    'builder_projects',
    'units',
    'career_applications',
    'activity_logs',
    'audit_logs',
    'subscriptions',
    'plan_features',
  ];

  for (const tableName of uuidMigrationTargets) {
    try {
      await pool.query(`
        ALTER TABLE IF EXISTS ${tableName}
        ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid()
      `);
      await pool.query(`
        UPDATE ${tableName}
        SET uuid_id = gen_random_uuid()
        WHERE uuid_id IS NULL
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_uuid_id_unique
        ON ${tableName}(uuid_id)
      `);
    } catch {
      // Table may not exist yet (created by a later ensure* function); skip gracefully.
    }
  }

  const rolesSeed = [
    ['main_admin', 'Main Admin', 'Full system access and irreversible controls'],
    ['admin', 'Admin', 'Limited high-control platform operator'],
    ['team_member', 'Team Member', 'Operational team workflow user'],
    ['owner', 'Owner', 'Property owner account with owner panel access'],
    ['agent', 'Agent', 'Agent account for managed listing workflows'],
    ['builder', 'Builder', 'Builder/dealer company account'],
    ['user', 'User', 'Standard platform user'],
  ];

  for (const roleRow of rolesSeed) {
    await pool.query(
      `
        INSERT INTO roles (role_key, title, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_key)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          updated_at = NOW(),
          deleted_at = NULL
      `,
      roleRow
    );
  }

  const permissionsSeed = [
    ['approve_listing', 'Approve, reject, and moderate listings', 'listing'],
    ['reject_listing', 'Reject listings with moderation notes', 'listing'],
    ['suspend_user', 'Suspend and reactivate platform users', 'user_management'],
    ['revoke_sessions', 'Revoke active sessions of platform users', 'security'],
    ['manage_promotions', 'Create and manage promotions', 'marketing'],
    ['verify_builder', 'Approve builder and dealer verification', 'compliance'],
    ['access_risk_dashboard', 'Access risk scoring and fraud views', 'risk'],
    ['view_risk_dashboard', 'Access risk scoring and fraud views', 'risk'],
    ['manage_team', 'Manage team member assignment and status', 'team'],
    ['assign_team_request', 'Assign listing and support requests to team members', 'team'],
    ['manage_users', 'Manage platform user records', 'user_management'],
    ['manage_feature_flags', 'Toggle platform-level feature flags', 'platform'],
    ['modify_platform_flags', 'Modify platform-wide safety and feature controls', 'platform'],
    ['manage_subscriptions', 'Manage subscription plans and user entitlements', 'billing'],
    ['manage_subscription', 'Manage subscription plans and user entitlements', 'billing'],
    ['access_analytics', 'Access analytics and insights data', 'analytics'],
    ['manage_company', 'Manage builder/dealer company entities', 'company'],
    ['approve_company', 'Approve or reject company verification', 'company'],
    ['edit_units', 'Create and update floor layout and units', 'inventory'],
    ['manage_complex', 'Manage apartment complex buildings and rent records', 'inventory'],
    ['view_audit_logs', 'View system-wide audit logs', 'security'],
    ['access_audit_logs', 'View system-wide audit logs', 'security'],
    ['manage_media', 'Manage sensitive platform media assets', 'platform'],
    ['boost_listing', 'Apply paid boosts to owned listings', 'listing'],
    ['export_reports', 'Export reports and operational data', 'reporting'],
    ['manage_material_catalog', 'Manage materials catalog items', 'catalog'],
  ];

  for (const permission of permissionsSeed) {
    await pool.query(
      `
        INSERT INTO permissions (permission_key, description, module_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (permission_key)
        DO UPDATE SET
          description = EXCLUDED.description,
          module_name = EXCLUDED.module_name,
          updated_at = NOW(),
          deleted_at = NULL
      `,
      permission
    );
  }

  const rolePermissionSeed = [
    ['main_admin', 'approve_listing', false],
    ['main_admin', 'reject_listing', false],
    ['main_admin', 'suspend_user', false],
    ['main_admin', 'revoke_sessions', false],
    ['main_admin', 'manage_promotions', false],
    ['main_admin', 'verify_builder', false],
    ['main_admin', 'access_risk_dashboard', false],
    ['main_admin', 'view_risk_dashboard', false],
    ['main_admin', 'manage_team', false],
    ['main_admin', 'assign_team_request', false],
    ['main_admin', 'manage_users', false],
    ['main_admin', 'manage_feature_flags', false],
    ['main_admin', 'modify_platform_flags', false],
    ['main_admin', 'manage_subscriptions', false],
    ['main_admin', 'manage_subscription', false],
    ['main_admin', 'access_analytics', false],
    ['main_admin', 'manage_company', false],
    ['main_admin', 'approve_company', false],
    ['main_admin', 'edit_units', false],
    ['main_admin', 'manage_complex', false],
    ['main_admin', 'view_audit_logs', false],
    ['main_admin', 'access_audit_logs', false],
    ['main_admin', 'manage_media', false],
    ['main_admin', 'boost_listing', false],
    ['main_admin', 'export_reports', false],
    ['main_admin', 'manage_material_catalog', false],
    ['admin', 'approve_listing', false],
    ['admin', 'reject_listing', false],
    ['admin', 'suspend_user', false],
    ['admin', 'manage_promotions', false],
    ['admin', 'verify_builder', false],
    ['admin', 'access_risk_dashboard', false],
    ['admin', 'view_risk_dashboard', false],
    ['admin', 'manage_team', false],
    ['admin', 'assign_team_request', false],
    ['admin', 'manage_users', false],
    ['admin', 'access_analytics', false],
    ['admin', 'manage_company', false],
    ['admin', 'approve_company', false],
    ['admin', 'edit_units', false],
    ['admin', 'manage_complex', false],
    ['admin', 'manage_material_catalog', true],
    ['admin', 'manage_media', true],
    ['admin', 'revoke_sessions', true],
    ['admin', 'manage_feature_flags', true],
    ['admin', 'modify_platform_flags', true],
    ['admin', 'manage_subscriptions', true],
    ['admin', 'manage_subscription', true],
    ['admin', 'view_audit_logs', true],
    ['admin', 'access_audit_logs', true],
    ['admin', 'export_reports', true],
    ['team_member', 'approve_listing', false],
    ['team_member', 'reject_listing', false],
    ['team_member', 'access_risk_dashboard', false],
    ['team_member', 'view_risk_dashboard', false],
    ['user', 'manage_complex', false],
    ['user', 'boost_listing', false],
  ];

  for (const rolePermission of rolePermissionSeed) {
    await pool.query(
      `
        INSERT INTO role_permissions (role, permission_key, main_admin_only)
        VALUES ($1, $2, $3)
        ON CONFLICT (role, permission_key, main_admin_only)
        DO UPDATE SET
          updated_at = NOW(),
          deleted_at = NULL
      `,
      rolePermission
    );
  }

  await pool.query(`
    DELETE FROM role_permissions
    WHERE role = 'user'
      AND permission_key = 'manage_users'
  `);

  await pool.query(`
    UPDATE user_roles
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE assignment_source = 'legacy_bridge'
      AND deleted_at IS NULL
  `);

  await pool.query(`
    INSERT INTO user_roles (
      user_id,
      role_key,
      assigned_by_user_id,
      assignment_source,
      deleted_at
    )
    SELECT
      u.id,
      u.role,
      u.id,
      'legacy_bridge',
      NULL
    FROM users u
    WHERE u.deleted_at IS NULL
    ON CONFLICT (user_id, role_key) WHERE deleted_at IS NULL
    DO UPDATE SET
      deleted_at = NULL,
      updated_at = NOW(),
      assignment_source = 'legacy_bridge'
  `);

  await pool.query(`
    INSERT INTO user_roles (
      user_id,
      role_key,
      assigned_by_user_id,
      assignment_source,
      deleted_at
    )
    SELECT
      u.id,
      'main_admin',
      u.id,
      'legacy_bridge',
      NULL
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.is_main_admin = TRUE
    ON CONFLICT (user_id, role_key) WHERE deleted_at IS NULL
    DO UPDATE SET
      deleted_at = NULL,
      updated_at = NOW(),
      assignment_source = 'legacy_bridge'
  `);

  await pool.query(`
    UPDATE user_roles ur
    SET deleted_at = NOW(),
        updated_at = NOW()
    FROM users u
    WHERE ur.user_id = u.id
      AND ur.assignment_source = 'legacy_bridge'
      AND ur.role_key = 'main_admin'
      AND ur.deleted_at IS NULL
      AND u.is_main_admin = FALSE
  `);

  const subscriptionPlansSeed = [
    ['free_plan', 'Free', 'free', 0, 0],
    ['pro_plan', 'Pro', 'pro', 1499, 14990],
    ['premium_plan', 'Premium', 'premium', 3999, 39990],
    ['enterprise_plan', 'Enterprise', 'enterprise', 12999, 129990],
  ];

  for (const planRow of subscriptionPlansSeed) {
    await pool.query(
      `
        INSERT INTO subscription_plans (
          plan_id,
          plan_name,
          tier,
          monthly_price,
          yearly_price
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (plan_id)
        DO UPDATE SET
          plan_name = EXCLUDED.plan_name,
          tier = EXCLUDED.tier,
          monthly_price = EXCLUDED.monthly_price,
          yearly_price = EXCLUDED.yearly_price,
          is_active = TRUE,
          updated_at = NOW()
      `,
      planRow
    );
  }

  const planFeaturesSeed = [
    ['free_plan', 'listing_quota', true, 10],
    ['free_plan', 'boost_listing', false, 3],
    ['free_plan', 'analytics_access', false, 0],
    ['free_plan', 'crm_access', false, 0],
    ['free_plan', 'verified_eligibility', false, 0],
    ['pro_plan', 'listing_quota', true, 50],
    ['pro_plan', 'boost_listing', true, 20],
    ['pro_plan', 'analytics_access', true, 1],
    ['pro_plan', 'crm_access', true, 1],
    ['pro_plan', 'verified_eligibility', false, 0],
    ['premium_plan', 'listing_quota', true, 200],
    ['premium_plan', 'boost_listing', true, 60],
    ['premium_plan', 'analytics_access', true, 1],
    ['premium_plan', 'crm_access', true, 1],
    ['premium_plan', 'verified_eligibility', true, 1],
    ['enterprise_plan', 'listing_quota', true, 1000],
    ['enterprise_plan', 'boost_listing', true, 200],
    ['enterprise_plan', 'analytics_access', true, 1],
    ['enterprise_plan', 'crm_access', true, 1],
    ['enterprise_plan', 'verified_eligibility', true, 1],
  ];

  for (const featureRow of planFeaturesSeed) {
    await pool.query(
      `
        INSERT INTO plan_features (plan_id, feature_key, is_enabled, limit_value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (plan_id, feature_key)
        DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          limit_value = EXCLUDED.limit_value,
          updated_at = NOW()
      `,
      featureRow
    );
  }

  const ownerEmail = process.env.MAIN_ADMIN_EMAIL?.trim().toLowerCase() || '';
  const ownerPassword = process.env.MAIN_ADMIN_PASSWORD || '';
  const ownerName = process.env.MAIN_ADMIN_NAME?.trim() || process.env.APP_NAME?.trim() || ownerEmail;
  const ownerPhone = process.env.MAIN_ADMIN_PHONE?.trim() || null;

  const existingOwner = await pool.query(
    'SELECT id FROM users WHERE is_main_admin = TRUE LIMIT 1'
  );

  if (existingOwner.rowCount === 0) {
    if (!ownerEmail) {
      console.warn(
        '[SECURITY] Skipping main admin bootstrap. Set MAIN_ADMIN_EMAIL to promote or create the bootstrap admin account.'
      );
    } else {
      const ownerByEmail = await pool.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [ownerEmail]
      );

      if (ownerByEmail.rowCount > 0) {
        await pool.query(
          `
            UPDATE users
            SET role = 'admin',
                account_type = 'corporate',
                subscription_tier = 'enterprise',
                is_main_admin = TRUE,
                is_active = TRUE
            WHERE id = $1
          `,
          [ownerByEmail.rows[0].id]
        );
      } else {
        if (!ownerPassword) {
          console.warn(
            `[SECURITY] Skipping bootstrap admin creation for ${ownerEmail}. Set MAIN_ADMIN_PASSWORD to create the account automatically.`
          );
        } else {
          const passwordHash = await bcrypt.hash(ownerPassword, 12);
          await pool.query(
            `
              INSERT INTO users (
                name,
                email,
                password_hash,
                phone,
                role,
                account_type,
                subscription_tier,
                is_main_admin,
                is_active,
                force_password_reset
              )
              VALUES ($1, $2, $3, $4, 'admin', 'corporate', 'enterprise', TRUE, TRUE, TRUE)
            `,
            [ownerName || ownerEmail, ownerEmail, passwordHash, ownerPhone]
          );
        }
      }
    }
  }

  // NOTE: subscriptions.owner_id has NOT NULL on first boot; ensureOwnerTables() (run later)
  // drops that constraint. Wrap in try-catch so first-boot doesn't crash — the seed will
  // succeed on subsequent starts once the schema migration has run.
  try {
    await pool.query(`
      INSERT INTO subscriptions (
        user_id,
        plan_id,
        subscription_tier,
        start_date,
        end_date,
        features_json,
        listing_quota,
        boost_credits,
        is_active,
        created_by_user_id
      )
      SELECT
        u.id,
        CASE u.subscription_tier
          WHEN 'enterprise' THEN 'enterprise_plan'
          WHEN 'premium' THEN 'premium_plan'
          WHEN 'pro' THEN 'pro_plan'
          ELSE 'free_plan'
        END AS plan_id,
        u.subscription_tier,
        CURRENT_DATE,
        NULL,
        '{}'::jsonb,
        CASE u.subscription_tier
          WHEN 'enterprise' THEN 1000
          WHEN 'premium' THEN 200
          WHEN 'pro' THEN 50
          ELSE 10
        END AS listing_quota,
        CASE u.subscription_tier
          WHEN 'enterprise' THEN 200
          WHEN 'premium' THEN 60
          WHEN 'pro' THEN 20
          ELSE 3
        END AS boost_credits,
        TRUE,
        NULL
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.is_active = TRUE
      )
    `);
  } catch (subscriptionSeedError) {
    // Schema migration for subscriptions.owner_id NOT NULL may not have run yet
    // (ensureOwnerTables runs after ensureAuthTables). This is safe to skip on first boot.
    const pgCode = typeof subscriptionSeedError?.code === 'string' ? subscriptionSeedError.code : '';
    if (pgCode === '23502') {
      console.warn('[DB] subscriptions seed skipped (owner_id NOT NULL not yet dropped — will retry next boot after ensureOwnerTables runs).');
    } else {
      throw subscriptionSeedError;
    }
  }
}

export async function ensureOwnerTables() {
  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE owner_profiles
      ADD COLUMN IF NOT EXISTS kyc_document_url TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
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
  `);

  // Migrate: owner_id → nullable so the newer user_id-based seed works.
  await pool.query(`
    ALTER TABLE subscriptions
      ALTER COLUMN owner_id DROP NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
  `);
  // Backfill: keep owner_id and user_id in sync.
  await pool.query(`
    UPDATE subscriptions SET user_id = owner_id WHERE user_id IS NULL AND owner_id IS NOT NULL;
  `);
  await pool.query(`
    UPDATE subscriptions SET owner_id = user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;
  `);
  // Also make legacy columns have defaults so the newer auth seed doesn't violate NOT NULL.
  await pool.query(`
    ALTER TABLE subscriptions
      ALTER COLUMN plan_name SET DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE subscriptions
      ALTER COLUMN price SET DEFAULT 0;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_kind VARCHAR(32) NOT NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'razorpay',
      status VARCHAR(24) NOT NULL DEFAULT 'created',
      currency_code VARCHAR(8) NOT NULL DEFAULT 'INR',
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      provider_order_id VARCHAR(120),
      provider_payment_id VARCHAR(120),
      provider_signature VARCHAR(255) NOT NULL DEFAULT '',
      provider_receipt VARCHAR(120) NOT NULL DEFAULT '',
      provider_last_event_type VARCHAR(80) NOT NULL DEFAULT '',
      related_plan_id VARCHAR(40) REFERENCES subscription_plans(plan_id) ON DELETE SET NULL,
      related_plan_name VARCHAR(120) NOT NULL DEFAULT '',
      related_listing_reference VARCHAR(80) NOT NULL DEFAULT '',
      fulfilled_entity_type VARCHAR(32) NOT NULL DEFAULT '',
      fulfilled_entity_id BIGINT,
      activated_subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      paid_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('ALTER TABLE billing_orders DROP CONSTRAINT IF EXISTS billing_orders_kind_check;');
  await pool.query(`
    ALTER TABLE billing_orders
      ADD CONSTRAINT billing_orders_kind_check
      CHECK (order_kind IN ('subscription', 'sponsored_listing', 'ecommerce'));
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'billing_orders_status_check'
      ) THEN
        ALTER TABLE billing_orders
          ADD CONSTRAINT billing_orders_status_check
          CHECK (status IN ('created', 'authorized', 'paid', 'failed', 'expired', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listing_assist_requests (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      requester_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE SET NULL,
      assist_type VARCHAR(24) NOT NULL,
      route_owner VARCHAR(24) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      source_context VARCHAR(64) NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fulfilled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listing_assist_requests_type_check'
      ) THEN
        ALTER TABLE listing_assist_requests
          ADD CONSTRAINT listing_assist_requests_type_check
          CHECK (assist_type IN ('brochure', 'price_sheet', 'loan_help'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listing_assist_requests_route_check'
      ) THEN
        ALTER TABLE listing_assist_requests
          ADD CONSTRAINT listing_assist_requests_route_check
          CHECK (route_owner IN ('owner', 'team_support'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listing_assist_requests_status_check'
      ) THEN
        ALTER TABLE listing_assist_requests
          ADD CONSTRAINT listing_assist_requests_status_check
          CHECK (status IN ('open', 'in_progress', 'closed', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listing_sponsorships (
      id BIGSERIAL PRIMARY KEY,
      property_request_id BIGINT NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
      owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      billing_order_id BIGINT REFERENCES billing_orders(id) ON DELETE SET NULL,
      placement VARCHAR(24) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',
      title_override VARCHAR(180) NOT NULL DEFAULT '',
      subtitle_override VARCHAR(240) NOT NULL DEFAULT '',
      description_override TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      badge_text VARCHAR(60) NOT NULL DEFAULT 'Sponsored',
      cta_label VARCHAR(60) NOT NULL DEFAULT 'Open Listing',
      target_city VARCHAR(120) NOT NULL DEFAULT '',
      target_locality VARCHAR(160) NOT NULL DEFAULT '',
      target_request_type VARCHAR(16) NOT NULL DEFAULT '',
      target_property_type VARCHAR(40) NOT NULL DEFAULT '',
      sort_priority INT NOT NULL DEFAULT 100,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listing_sponsorships_placement_check'
      ) THEN
        ALTER TABLE listing_sponsorships
          ADD CONSTRAINT listing_sponsorships_placement_check
          CHECK (placement IN ('portal_home', 'public_results'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'listing_sponsorships_status_check'
      ) THEN
        ALTER TABLE listing_sponsorships
          ADD CONSTRAINT listing_sponsorships_status_check
          CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_tenant_records (
      id BIGSERIAL PRIMARY KEY,
      rental_id BIGINT NOT NULL UNIQUE REFERENCES rentals(id) ON DELETE CASCADE,
      owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_name VARCHAR(140) NOT NULL DEFAULT '',
      tenant_phone VARCHAR(32) NOT NULL DEFAULT '',
      tenant_email VARCHAR(190) NOT NULL DEFAULT '',
      lease_start_date DATE,
      lease_end_date DATE,
      monthly_rent NUMERIC(14, 2),
      security_deposit NUMERIC(14, 2),
      rent_due_day INT NOT NULL DEFAULT 5,
      notify_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (rent_due_day >= 1 AND rent_due_day <= 31)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_payment_records (
      id BIGSERIAL PRIMARY KEY,
      tenant_record_id BIGINT REFERENCES rental_tenant_records(id) ON DELETE SET NULL,
      rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month_key VARCHAR(7) NOT NULL,
      due_date DATE,
      amount_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
      amount_received NUMERIC(14, 2) NOT NULL DEFAULT 0,
      received_on DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_method VARCHAR(40) NOT NULL DEFAULT 'bank_transfer',
      notes TEXT NOT NULL DEFAULT '',
      notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT rental_payment_records_rental_month_unique UNIQUE (rental_id, month_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_notification_logs (
      id BIGSERIAL PRIMARY KEY,
      rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_record_id BIGINT REFERENCES rental_tenant_records(id) ON DELETE SET NULL,
      month_key VARCHAR(7),
      channel VARCHAR(20) NOT NULL DEFAULT 'email',
      recipient VARCHAR(190) NOT NULL DEFAULT '',
      subject VARCHAR(200) NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      queued BOOLEAN NOT NULL DEFAULT FALSE,
      delivered BOOLEAN NOT NULL DEFAULT FALSE,
      provider_response TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rental_payment_records_status_check'
      ) THEN
        ALTER TABLE rental_payment_records
          ADD CONSTRAINT rental_payment_records_status_check
          CHECK (status IN ('pending', 'partial', 'paid', 'overdue'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rental_payment_records_month_key_check'
      ) THEN
        ALTER TABLE rental_payment_records
          ADD CONSTRAINT rental_payment_records_month_key_check
          CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rental_payment_records_amount_nonnegative_check'
      ) THEN
        ALTER TABLE rental_payment_records
          ADD CONSTRAINT rental_payment_records_amount_nonnegative_check
          CHECK (amount_due >= 0 AND amount_received >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rental_notification_logs_channel_check'
      ) THEN
        ALTER TABLE rental_notification_logs
          ADD CONSTRAINT rental_notification_logs_channel_check
          CHECK (channel IN ('email', 'sms', 'in_app'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rental_notification_logs_month_key_check'
      ) THEN
        ALTER TABLE rental_notification_logs
          ADD CONSTRAINT rental_notification_logs_month_key_check
          CHECK (month_key IS NULL OR month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new',
      ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE rental_leads
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new',
      ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_rental_tenant_records_updated_at ON rental_tenant_records;');
  await pool.query(`
    CREATE TRIGGER trg_rental_tenant_records_updated_at
    BEFORE UPDATE ON rental_tenant_records
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_rental_payment_records_updated_at ON rental_payment_records;');
  await pool.query(`
    CREATE TRIGGER trg_rental_payment_records_updated_at
    BEFORE UPDATE ON rental_payment_records
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_billing_orders_updated_at ON billing_orders;');
  await pool.query(`
    CREATE TRIGGER trg_billing_orders_updated_at
    BEFORE UPDATE ON billing_orders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_listing_assist_requests_updated_at ON listing_assist_requests;');
  await pool.query(`
    CREATE TRIGGER trg_listing_assist_requests_updated_at
    BEFORE UPDATE ON listing_assist_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_listing_sponsorships_updated_at ON listing_sponsorships;');
  await pool.query(`
    CREATE TRIGGER trg_listing_sponsorships_updated_at
    BEFORE UPDATE ON listing_sponsorships
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS owner_profiles_user_idx ON owner_profiles(user_id);
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name = 'owner_id'
      ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON subscriptions(owner_id, created_at DESC)';
      ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name = 'user_id'
      ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON subscriptions(user_id, created_at DESC)';
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS boosts_owner_idx ON boosts(owner_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_orders_user_created_idx
      ON billing_orders(user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_orders_status_idx
      ON billing_orders(status, order_kind, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_provider_order_unique
      ON billing_orders(provider_order_id)
      WHERE provider_order_id IS NOT NULL AND provider_order_id <> '';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_provider_payment_unique
      ON billing_orders(provider_payment_id)
      WHERE provider_payment_id IS NOT NULL AND provider_payment_id <> '';
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_assist_requests_property_idx
      ON listing_assist_requests(property_request_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_assist_requests_requester_idx
      ON listing_assist_requests(requester_user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS listing_assist_requests_open_unique
      ON listing_assist_requests(property_request_id, requester_user_id, assist_type)
      WHERE status IN ('open', 'in_progress');
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_sponsorships_owner_idx
      ON listing_sponsorships(owner_user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_sponsorships_public_idx
      ON listing_sponsorships(status, placement, sort_priority, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_sponsorships_property_idx
      ON listing_sponsorships(property_request_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties(posted_by, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_owner_idx ON rentals(posted_by, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_tenant_records_owner_idx
      ON rental_tenant_records(owner_id, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_tenant_records_rental_idx
      ON rental_tenant_records(rental_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_payment_records_owner_rental_idx
      ON rental_payment_records(owner_id, rental_id, month_key DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_payment_records_status_idx
      ON rental_payment_records(owner_id, status, month_key DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_notification_logs_owner_idx
      ON rental_notification_logs(owner_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_notification_logs_rental_idx
      ON rental_notification_logs(rental_id, created_at DESC);
  `);
}

export async function ensureDalalCoinTables() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_code VARCHAR(24),
      ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS referred_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS dalal_coins INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dalal_coin_balance INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dalal_coin_tier VARCHAR(20) NOT NULL DEFAULT 'silver';
  `);

  await pool.query(`
    UPDATE users
    SET referred_by_user_id = COALESCE(referred_by_user_id, referred_by),
        referred_by = COALESCE(referred_by, referred_by_user_id),
        dalal_coin_balance = GREATEST(COALESCE(dalal_coin_balance, dalal_coins, 0), 0),
        dalal_coins = GREATEST(COALESCE(dalal_coin_balance, dalal_coins, 0), 0);
  `);

  await pool.query(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_dalal_coin_balance_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_dalal_coin_balance_check
          CHECK (dalal_coins >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_dalal_coin_tier_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_dalal_coin_tier_check
          CHECK (dalal_coin_tier IN ('silver', 'gold', 'platinum'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_dalal_coin_cached_balance_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_dalal_coin_cached_balance_check
          CHECK (dalal_coin_balance >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS coins_used INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS final_price NUMERIC(14, 2);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_coins_used_non_negative_check'
      ) THEN
        ALTER TABLE subscriptions
          ADD CONSTRAINT subscriptions_coins_used_non_negative_check
          CHECK (coins_used >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_grants (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL,
      remaining_amount INT NOT NULL,
      reserved_amount INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      reason_code VARCHAR(60) NOT NULL,
      unlock_requirement VARCHAR(40) NOT NULL DEFAULT 'none',
      source_type VARCHAR(40) NOT NULL DEFAULT '',
      source_id VARCHAR(120) NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      confirmed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_grants_amount_positive_check'
      ) THEN
        ALTER TABLE dalal_coin_grants
          ADD CONSTRAINT dalal_coin_grants_amount_positive_check
          CHECK (amount > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_grants_remaining_range_check'
      ) THEN
        ALTER TABLE dalal_coin_grants
          ADD CONSTRAINT dalal_coin_grants_remaining_range_check
          CHECK (
            remaining_amount >= 0
            AND reserved_amount >= 0
            AND reserved_amount <= remaining_amount
            AND remaining_amount <= amount
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_grants_status_check'
      ) THEN
        ALTER TABLE dalal_coin_grants
          ADD CONSTRAINT dalal_coin_grants_status_check
          CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_grants_unlock_requirement_check'
      ) THEN
        ALTER TABLE dalal_coin_grants
          ADD CONSTRAINT dalal_coin_grants_unlock_requirement_check
          CHECK (unlock_requirement IN ('none', 'phone_verification', 'referred_user_first_paid'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL,
      remaining_amount INT NOT NULL DEFAULT 0,
      type VARCHAR(12) NOT NULL,
      reason VARCHAR(80) NOT NULL,
      reference_type VARCHAR(40) NOT NULL DEFAULT '',
      reference_id VARCHAR(120) NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE dalal_coin_transactions
      ADD COLUMN IF NOT EXISTS grant_id BIGINT REFERENCES dalal_coin_grants(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS hold_id BIGINT,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'posted';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_transactions_amount_positive_check'
      ) THEN
        ALTER TABLE dalal_coin_transactions
          ADD CONSTRAINT dalal_coin_transactions_amount_positive_check
          CHECK (amount > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_transactions_type_check'
      ) THEN
        ALTER TABLE dalal_coin_transactions
          ADD CONSTRAINT dalal_coin_transactions_type_check
          CHECK (type IN ('credit', 'debit'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_transactions_remaining_range_check'
      ) THEN
        ALTER TABLE dalal_coin_transactions
          ADD CONSTRAINT dalal_coin_transactions_remaining_range_check
          CHECK (
            remaining_amount >= 0
            AND remaining_amount <= amount
            AND (
              (type = 'credit')
              OR (type = 'debit' AND remaining_amount = 0)
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_transactions_status_check'
      ) THEN
        ALTER TABLE dalal_coin_transactions
          ADD CONSTRAINT dalal_coin_transactions_status_check
          CHECK (status IN ('posted', 'reversed'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      referral_code VARCHAR(24) NOT NULL,
      signup_device_id VARCHAR(120) NOT NULL DEFAULT '',
      signup_ip_address VARCHAR(64) NOT NULL DEFAULT '',
      status VARCHAR(40) NOT NULL DEFAULT 'pending_phone_verification',
      blocked_reason VARCHAR(60) NOT NULL DEFAULT '',
      first_paid_order_type VARCHAR(40) NOT NULL DEFAULT '',
      first_paid_order_id VARCHAR(120) NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_referrals_status_check'
      ) THEN
        ALTER TABLE user_referrals
          ADD CONSTRAINT user_referrals_status_check
          CHECK (
            status IN (
              'pending_phone_verification',
              'pending_first_paid_action',
              'completed',
              'blocked'
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      referral_code VARCHAR(24) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_first_action',
      referred_device_id VARCHAR(120) NOT NULL DEFAULT '',
      referred_ip_address VARCHAR(120) NOT NULL DEFAULT '',
      qualifying_action VARCHAR(40) NOT NULL DEFAULT '',
      qualifying_reference_id VARCHAR(120) NOT NULL DEFAULT '',
      rewarded_referrer_amount INT NOT NULL DEFAULT 0,
      rewarded_referred_amount INT NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_referrals_status_check'
      ) THEN
        ALTER TABLE dalal_coin_referrals
          ADD CONSTRAINT dalal_coin_referrals_status_check
          CHECK (
            status IN (
              'pending_first_action',
              'completed',
              'blocked_device_limit',
              'blocked_ip_limit'
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_referrals_reward_amount_non_negative_check'
      ) THEN
        ALTER TABLE dalal_coin_referrals
          ADD CONSTRAINT dalal_coin_referrals_reward_amount_non_negative_check
          CHECK (
            rewarded_referrer_amount >= 0
            AND rewarded_referred_amount >= 0
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_campaigns (
      id BIGSERIAL PRIMARY KEY,
      campaign_code VARCHAR(40) NOT NULL UNIQUE,
      title VARCHAR(160) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reward_multiplier NUMERIC(8, 2) NOT NULL DEFAULT 1,
      extra_bonus_coins INT NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_campaigns_multiplier_positive_check'
      ) THEN
        ALTER TABLE dalal_coin_campaigns
          ADD CONSTRAINT dalal_coin_campaigns_multiplier_positive_check
          CHECK (reward_multiplier > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_campaigns_bonus_non_negative_check'
      ) THEN
        ALTER TABLE dalal_coin_campaigns
          ADD CONSTRAINT dalal_coin_campaigns_bonus_non_negative_check
          CHECK (extra_bonus_coins >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_reservations (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL,
      context_type VARCHAR(40) NOT NULL,
      context_id VARCHAR(120) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_reservations_amount_positive_check'
      ) THEN
        ALTER TABLE dalal_coin_reservations
          ADD CONSTRAINT dalal_coin_reservations_amount_positive_check
          CHECK (amount > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_reservations_status_check'
      ) THEN
        ALTER TABLE dalal_coin_reservations
          ADD CONSTRAINT dalal_coin_reservations_status_check
          CHECK (status IN ('active', 'released', 'consumed', 'expired'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_orders (
      id BIGSERIAL PRIMARY KEY,
      order_reference VARCHAR(80) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
      coins_used INT NOT NULL DEFAULT 0,
      final_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecommerce_orders (
      id BIGSERIAL PRIMARY KEY,
      order_reference VARCHAR(80) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
      coins_used INT NOT NULL DEFAULT 0,
      final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
      order_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE ecommerce_orders
      ADD COLUMN IF NOT EXISTS billing_order_id BIGINT REFERENCES billing_orders(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS coin_discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS contact_name VARCHAR(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(190) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS shipping_address TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
  `);

  await pool.query('ALTER TABLE ecommerce_orders DROP CONSTRAINT IF EXISTS ecommerce_orders_status_check;');
  await pool.query(`
    ALTER TABLE ecommerce_orders
      ADD CONSTRAINT ecommerce_orders_status_check
      CHECK (status IN ('created', 'pending', 'paid', 'confirmed', 'failed', 'expired', 'cancelled'));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecommerce_order_items (
      id BIGSERIAL PRIMARY KEY,
      ecommerce_order_id BIGINT NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
      material_item_id UUID REFERENCES material_items(id) ON DELETE SET NULL,
      item_code VARCHAR(60) NOT NULL DEFAULT '',
      item_name VARCHAR(200) NOT NULL,
      brand VARCHAR(120) NOT NULL DEFAULT '',
      unit VARCHAR(40) NOT NULL DEFAULT '',
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      line_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ecommerce_order_items_quantity_positive_check'
      ) THEN
        ALTER TABLE ecommerce_order_items
          ADD CONSTRAINT ecommerce_order_items_quantity_positive_check
          CHECK (quantity > 0 AND unit_price >= 0 AND line_subtotal >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dalal_coin_holds (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hold_kind VARCHAR(24) NOT NULL,
      billing_order_id BIGINT REFERENCES billing_orders(id) ON DELETE SET NULL,
      ecommerce_order_id BIGINT REFERENCES ecommerce_orders(id) ON DELETE SET NULL,
      coins_amount INT NOT NULL,
      rupee_discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      allocation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_holds_amount_positive_check'
      ) THEN
        ALTER TABLE dalal_coin_holds
          ADD CONSTRAINT dalal_coin_holds_amount_positive_check
          CHECK (coins_amount > 0 AND rupee_discount_amount >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_holds_kind_check'
      ) THEN
        ALTER TABLE dalal_coin_holds
          ADD CONSTRAINT dalal_coin_holds_kind_check
          CHECK (hold_kind IN ('subscription', 'ecommerce'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dalal_coin_holds_status_check'
      ) THEN
        ALTER TABLE dalal_coin_holds
          ADD CONSTRAINT dalal_coin_holds_status_check
          CHECK (status IN ('active', 'consumed', 'released', 'expired'));
      END IF;
    END $$;
  `);

  await pool.query('ALTER TABLE dalal_coin_transactions DROP CONSTRAINT IF EXISTS dalal_coin_transactions_hold_id_fkey;');
  await pool.query(`
    ALTER TABLE dalal_coin_transactions
      ADD CONSTRAINT dalal_coin_transactions_hold_id_fkey
      FOREIGN KEY (hold_id) REFERENCES dalal_coin_holds(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'property_orders_status_check'
      ) THEN
        ALTER TABLE property_orders
          ADD CONSTRAINT property_orders_status_check
          CHECK (status IN ('pending', 'confirmed', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ecommerce_orders_status_check'
      ) THEN
        ALTER TABLE ecommerce_orders
          ADD CONSTRAINT ecommerce_orders_status_check
          CHECK (status IN ('pending', 'confirmed', 'cancelled'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'property_orders_non_negative_check'
      ) THEN
        ALTER TABLE property_orders
          ADD CONSTRAINT property_orders_non_negative_check
          CHECK (
            price >= 0
            AND discount_percent >= 0
            AND coins_used >= 0
            AND final_price >= 0
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ecommerce_orders_non_negative_check'
      ) THEN
        ALTER TABLE ecommerce_orders
          ADD CONSTRAINT ecommerce_orders_non_negative_check
          CHECK (
            total_amount >= 0
            AND discount_percent >= 0
            AND coins_used >= 0
            AND final_amount >= 0
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ecommerce_orders_extended_non_negative_check'
      ) THEN
        ALTER TABLE ecommerce_orders
          ADD CONSTRAINT ecommerce_orders_extended_non_negative_check
          CHECK (
            subtotal_amount >= 0
            AND delivery_amount >= 0
            AND coin_discount_amount >= 0
          );
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_dalal_coin_campaigns_updated_at ON dalal_coin_campaigns;');
  await pool.query(`
    CREATE TRIGGER trg_dalal_coin_campaigns_updated_at
    BEFORE UPDATE ON dalal_coin_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_dalal_coin_grants_updated_at ON dalal_coin_grants;');
  await pool.query(`
    CREATE TRIGGER trg_dalal_coin_grants_updated_at
    BEFORE UPDATE ON dalal_coin_grants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_user_referrals_updated_at ON user_referrals;');
  await pool.query(`
    CREATE TRIGGER trg_user_referrals_updated_at
    BEFORE UPDATE ON user_referrals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_dalal_coin_holds_updated_at ON dalal_coin_holds;');
  await pool.query(`
    CREATE TRIGGER trg_dalal_coin_holds_updated_at
    BEFORE UPDATE ON dalal_coin_holds
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_property_orders_updated_at ON property_orders;');
  await pool.query(`
    CREATE TRIGGER trg_property_orders_updated_at
    BEFORE UPDATE ON property_orders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_ecommerce_orders_updated_at ON ecommerce_orders;');
  await pool.query(`
    CREATE TRIGGER trg_ecommerce_orders_updated_at
    BEFORE UPDATE ON ecommerce_orders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique_idx
      ON users(referral_code)
      WHERE referral_code IS NOT NULL AND referral_code <> '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_referred_by_user_id_idx
      ON users(referred_by_user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_dalal_coin_balance_idx
      ON users(dalal_coin_balance DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_profiles_phone_verified_idx
      ON user_profiles(phone_verified_at)
      WHERE phone_verified_at IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_referred_by_idx
      ON users(referred_by);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_transactions_user_created_idx
      ON dalal_coin_transactions(user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_transactions_grant_idx
      ON dalal_coin_transactions(grant_id, created_at DESC)
      WHERE grant_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_transactions_hold_idx
      ON dalal_coin_transactions(hold_id, created_at DESC)
      WHERE hold_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_transactions_user_expiry_idx
      ON dalal_coin_transactions(user_id, expires_at ASC, created_at ASC)
      WHERE type = 'credit' AND remaining_amount > 0;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_grants_user_status_expiry_idx
      ON dalal_coin_grants(user_id, status, expires_at ASC, created_at ASC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_grants_source_idx
      ON dalal_coin_grants(source_type, source_id, user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_referrals_referrer_status_idx
      ON user_referrals(referrer_user_id, status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_referrals_referred_status_idx
      ON user_referrals(referred_user_id, status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_referrals_device_idx
      ON user_referrals(signup_device_id)
      WHERE signup_device_id <> '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_referrals_ip_idx
      ON user_referrals(signup_ip_address)
      WHERE signup_ip_address <> '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_referrals_referrer_idx
      ON dalal_coin_referrals(referrer_user_id, status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_referrals_device_idx
      ON dalal_coin_referrals(referred_device_id)
      WHERE referred_device_id <> '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_referrals_ip_idx
      ON dalal_coin_referrals(referred_ip_address)
      WHERE referred_ip_address <> '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_campaigns_active_idx
      ON dalal_coin_campaigns(is_active, starts_at, ends_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_reservations_active_idx
      ON dalal_coin_reservations(user_id, status, expires_at ASC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_holds_user_status_expiry_idx
      ON dalal_coin_holds(user_id, status, expires_at ASC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dalal_coin_holds_billing_order_idx
      ON dalal_coin_holds(billing_order_id)
      WHERE billing_order_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS property_orders_user_idx
      ON property_orders(user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS property_orders_property_idx
      ON property_orders(property_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecommerce_orders_user_idx
      ON ecommerce_orders(user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecommerce_orders_billing_order_idx
      ON ecommerce_orders(billing_order_id)
      WHERE billing_order_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecommerce_order_items_order_idx
      ON ecommerce_order_items(ecommerce_order_id, created_at ASC);
  `);
}

export async function ensureEAuctionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eauction_sources (
      id BIGSERIAL PRIMARY KEY,
      source_key TEXT,
      name TEXT NOT NULL,
      authority_name TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'common_portal',
      portal_url TEXT NOT NULL,
      official_listing_url TEXT NOT NULL DEFAULT '',
      official_detail_url TEXT NOT NULL DEFAULT '',
      notice_pdf_url TEXT NOT NULL DEFAULT '',
      source_domain TEXT NOT NULL DEFAULT '',
      allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      category TEXT NOT NULL DEFAULT 'all',
      description TEXT NOT NULL DEFAULT '',
      badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      login_required BOOLEAN NOT NULL DEFAULT FALSE,
      bidder_registration_required BOOLEAN NOT NULL DEFAULT FALSE,
      emd_mentioned BOOLEAN NOT NULL DEFAULT FALSE,
      domain_status TEXT NOT NULL DEFAULT 'verified',
      last_checked_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE eauction_sources
      ADD COLUMN IF NOT EXISTS source_key TEXT,
      ADD COLUMN IF NOT EXISTS authority_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'common_portal',
      ADD COLUMN IF NOT EXISTS official_listing_url TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS official_detail_url TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS notice_pdf_url TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS source_domain TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS login_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS bidder_registration_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS emd_mentioned BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS domain_status TEXT NOT NULL DEFAULT 'verified',
      ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE eauction_sources
    SET official_listing_url = portal_url
    WHERE official_listing_url = '';
  `);

  await pool.query(`
    UPDATE eauction_sources
    SET source_domain = REGEXP_REPLACE(REGEXP_REPLACE(official_listing_url, '^https?://', '', 'i'), '/.*$', '')
    WHERE source_domain = ''
      AND official_listing_url <> '';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_sources_category_check'
      ) THEN
        ALTER TABLE eauction_sources
          ADD CONSTRAINT eauction_sources_category_check
          CHECK (category IN ('plots', 'apartments', 'complex', 'all'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_sources_source_type_check'
      ) THEN
        ALTER TABLE eauction_sources
          ADD CONSTRAINT eauction_sources_source_type_check
          CHECK (source_type IN ('bank', 'government', 'common_portal'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_sources_domain_status_check'
      ) THEN
        ALTER TABLE eauction_sources
          ADD CONSTRAINT eauction_sources_domain_status_check
          CHECK (domain_status IN ('verified', 'review_required', 'blocked'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS eauction_sources_portal_url_unique
      ON eauction_sources (portal_url);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS eauction_sources_source_key_unique
      ON eauction_sources (source_key)
      WHERE source_key IS NOT NULL;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_eauction_sources_updated_at ON eauction_sources;');
  await pool.query(`
    CREATE TRIGGER trg_eauction_sources_updated_at
    BEFORE UPDATE ON eauction_sources
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS eauction_listings (
      id BIGSERIAL PRIMARY KEY,
      listing_key TEXT,
      source_id BIGINT REFERENCES eauction_sources(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      property_type TEXT NOT NULL DEFAULT 'other',
      bank_authority_name TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'bank',
      official_listing_url TEXT NOT NULL DEFAULT '',
      official_detail_url TEXT NOT NULL DEFAULT '',
      notice_pdf_url TEXT NOT NULL DEFAULT '',
      source_domain TEXT NOT NULL DEFAULT '',
      login_required BOOLEAN NOT NULL DEFAULT FALSE,
      bidder_registration_required BOOLEAN NOT NULL DEFAULT FALSE,
      emd_mentioned BOOLEAN NOT NULL DEFAULT FALSE,
      reserve_price_amount NUMERIC(18, 2),
      reserve_price_display TEXT NOT NULL DEFAULT '',
      emd_amount NUMERIC(18, 2),
      emd_display TEXT NOT NULL DEFAULT '',
      auction_date TIMESTAMPTZ,
      inspection_date TIMESTAMPTZ,
      state_name TEXT NOT NULL DEFAULT '',
      district_name TEXT NOT NULL DEFAULT '',
      city_name TEXT NOT NULL DEFAULT '',
      property_location TEXT NOT NULL DEFAULT '',
      domain_status TEXT NOT NULL DEFAULT 'verified',
      last_checked_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_listings_property_type_check'
      ) THEN
        ALTER TABLE eauction_listings
          ADD CONSTRAINT eauction_listings_property_type_check
          CHECK (property_type IN (
            'plot_land',
            'apartment_flat',
            'commercial',
            'industrial',
            'agricultural',
            'mixed',
            'other'
          ));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_listings_source_type_check'
      ) THEN
        ALTER TABLE eauction_listings
          ADD CONSTRAINT eauction_listings_source_type_check
          CHECK (source_type IN ('bank', 'government', 'common_portal'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'eauction_listings_domain_status_check'
      ) THEN
        ALTER TABLE eauction_listings
          ADD CONSTRAINT eauction_listings_domain_status_check
          CHECK (domain_status IN ('verified', 'review_required', 'blocked'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS eauction_listings_listing_key_unique
      ON eauction_listings (listing_key)
      WHERE listing_key IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS eauction_listings_source_idx
      ON eauction_listings (source_id, is_active, auction_date);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS eauction_listings_geo_idx
      ON eauction_listings (state_name, district_name, city_name);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS eauction_listings_type_idx
      ON eauction_listings (source_type, property_type, auction_date);
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_eauction_listings_updated_at ON eauction_listings;');
  await pool.query(`
    CREATE TRIGGER trg_eauction_listings_updated_at
    BEFORE UPDATE ON eauction_listings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  const seedSources = [
    {
      sourceKey: 'IBAPI',
      name: 'IBAPI',
      authorityName: 'Indian Banks Association / Department of Financial Services',
      sourceType: 'common_portal',
      portalUrl: 'https://ibapi.in/',
      officialListingUrl: 'https://ibapi.in/',
      officialDetailUrl: 'https://ibapi.in/',
      noticePdfUrl: '',
      sourceDomain: 'ibapi.in',
      allowedDomains: ['ibapi.in', 'www.ibapi.in', 'mstcecommerce.com', 'www.mstcecommerce.com'],
      category: 'all',
      badges: ['Official Bank Source', 'Common Portal', 'Property Search'],
      description:
        'Common mortgaged-property directory used by Indian banks to publish auction inventory and guide bidders to the official auction platform.',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: true,
      domainStatus: 'verified',
      sortOrder: 10,
    },
    {
      sourceKey: 'BAANKNET',
      name: 'BAANKNET',
      authorityName: 'PSB Alliance',
      sourceType: 'common_portal',
      portalUrl: 'https://baanknet.com/eauction-psb/home',
      officialListingUrl: 'https://baanknet.com/eauction-psb/home',
      officialDetailUrl: 'https://baanknet.com/eauction-psb/home',
      noticePdfUrl: '',
      sourceDomain: 'baanknet.com',
      allowedDomains: ['baanknet.com', 'www.baanknet.com'],
      category: 'all',
      badges: ['Official Bank Source', 'Buyer Registration', 'Auction Search'],
      description:
        'Public-sector-bank auction discovery portal with auction search, buyer registration, and bidder participation workflows.',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: true,
      domainStatus: 'verified',
      sortOrder: 20,
    },
    {
      sourceKey: 'NIC_EAUCTION_INDIA',
      name: 'NIC eAuction India',
      authorityName: 'National Informatics Centre / Auction Inviting Authorities',
      sourceType: 'government',
      portalUrl: 'https://eauction.gov.in/eAuction/app',
      officialListingUrl: 'https://eauction.gov.in/eAuction/app',
      officialDetailUrl: 'https://eauction.gov.in/eAuction/app',
      noticePdfUrl: '',
      sourceDomain: 'eauction.gov.in',
      allowedDomains: ['eauction.gov.in', 'www.eauction.gov.in', 'gepnicreports.gov.in'],
      category: 'all',
      badges: ['Official Government Source', 'Auction Search', 'Bidder Enrollment'],
      description:
        'Official government e-auction platform for public authorities, with auction search, status tracking, and bidder enrollment.',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      domainStatus: 'verified',
      sortOrder: 30,
    },
    {
      sourceKey: 'PNB_EAUCTION',
      name: 'PNB e-Auction',
      authorityName: 'Punjab National Bank',
      sourceType: 'bank',
      portalUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      sourceDomain: 'pnb.bank.in',
      allowedDomains: [
        'pnb.bank.in',
        'pnbindia.in',
        'www.pnbindia.in',
        'etender.pnb.bank.in',
        'etender.pnbnet.in',
      ],
      category: 'all',
      badges: ['Official Bank Source', 'Sale Notices', 'No Broker Involvement'],
      description:
        'Official Punjab National Bank e-auction listing page for sale notices, property notices, and linked auction portal access.',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: true,
      domainStatus: 'verified',
      sortOrder: 40,
    },
  ];

  const legacySeedNames = [
    'e-Auction India (Indian Banks)',
    'MSTC eCommerce (Govt PSU)',
    'SBI Auctions',
    'Bank of Baroda e-Auction',
    'Canara Bank e-Auction',
    'ICICI Bank Property Auctions',
  ];

  for (const source of seedSources) {
    await pool.query(
      `
        UPDATE eauction_sources
        SET
          name = $2,
          authority_name = $3,
          source_type = $4,
          portal_url = $5,
          official_listing_url = $6,
          official_detail_url = $7,
          notice_pdf_url = $8,
          source_domain = $9,
          allowed_domains = $10::text[],
          category = $11,
          description = $12,
          badges = $13::text[],
          login_required = $14,
          bidder_registration_required = $15,
          emd_mentioned = $16,
          domain_status = $17,
          last_checked_at = NOW(),
          is_active = TRUE,
          sort_order = $18
        WHERE source_key = $1
      `,
      [
        source.sourceKey,
        source.name,
        source.authorityName,
        source.sourceType,
        source.portalUrl,
        source.officialListingUrl,
        source.officialDetailUrl,
        source.noticePdfUrl,
        source.sourceDomain,
        source.allowedDomains,
        source.category,
        source.description,
        source.badges,
        Boolean(source.loginRequired),
        Boolean(source.bidderRegistrationRequired),
        Boolean(source.emdMentioned),
        source.domainStatus,
        source.sortOrder,
      ]
    );

    await pool.query(
      `
        INSERT INTO eauction_sources (
          source_key,
          name,
          authority_name,
          source_type,
          portal_url,
          official_listing_url,
          official_detail_url,
          notice_pdf_url,
          source_domain,
          allowed_domains,
          category,
          description,
          badges,
          login_required,
          bidder_registration_required,
          emd_mentioned,
          domain_status,
          last_checked_at,
          is_active,
          sort_order
        )
        SELECT
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::text[],
          $11,
          $12,
          $13::text[],
          $14,
          $15,
          $16,
          $17,
          NOW(),
          TRUE,
          $18
        WHERE NOT EXISTS (
          SELECT 1
          FROM eauction_sources
          WHERE source_key = $1
             OR portal_url = $5
        )
      `,
      [
        source.sourceKey,
        source.name,
        source.authorityName,
        source.sourceType,
        source.portalUrl,
        source.officialListingUrl,
        source.officialDetailUrl,
        source.noticePdfUrl,
        source.sourceDomain,
        source.allowedDomains,
        source.category,
        source.description,
        source.badges,
        Boolean(source.loginRequired),
        Boolean(source.bidderRegistrationRequired),
        Boolean(source.emdMentioned),
        source.domainStatus,
        source.sortOrder,
      ]
    );

    await pool.query(
      `
        UPDATE eauction_sources
        SET
          source_key = $1,
          authority_name = $3,
          source_type = $4,
          portal_url = $5,
          official_listing_url = $6,
          official_detail_url = $7,
          notice_pdf_url = $8,
          source_domain = $9,
          allowed_domains = $10::text[],
          category = $11,
          description = $12,
          badges = $13::text[],
          login_required = $14,
          bidder_registration_required = $15,
          emd_mentioned = $16,
          domain_status = $17,
          last_checked_at = NOW(),
          is_active = TRUE,
          sort_order = $18
        WHERE (LOWER(name) = LOWER($2) OR portal_url = $5)
          AND (source_key IS NULL OR source_key = '')
          AND NOT EXISTS (
            SELECT 1
            FROM eauction_sources current_source
            WHERE current_source.source_key = $1
          )
      `,
      [
        source.sourceKey,
        source.name,
        source.authorityName,
        source.sourceType,
        source.portalUrl,
        source.officialListingUrl,
        source.officialDetailUrl,
        source.noticePdfUrl,
        source.sourceDomain,
        source.allowedDomains,
        source.category,
        source.description,
        source.badges,
        Boolean(source.loginRequired),
        Boolean(source.bidderRegistrationRequired),
        Boolean(source.emdMentioned),
        source.domainStatus,
        source.sortOrder,
      ]
    );

    await pool.query(
      `
        UPDATE eauction_sources
        SET is_active = FALSE
        WHERE LOWER(name) = LOWER($2)
          AND (source_key IS NULL OR source_key <> $1)
          AND EXISTS (
            SELECT 1
            FROM eauction_sources current_source
            WHERE current_source.source_key = $1
          )
      `,
      [source.sourceKey, source.name]
    );
  }

  if (legacySeedNames.length > 0) {
    await pool.query(
      `
        UPDATE eauction_sources
        SET is_active = FALSE
        WHERE LOWER(name) = ANY($1::text[])
          AND (source_key IS NULL OR source_key = '')
      `,
      [legacySeedNames.map((name) => name.toLowerCase())]
    );
  }

  const sourceRows = await pool.query(`
    SELECT id, source_key, source_type, authority_name, source_domain
    FROM eauction_sources
    WHERE source_key IS NOT NULL
  `);
  const sourceMap = new Map(
    sourceRows.rows.map((row) => [
      String(row.source_key || ''),
      {
        id: Number(row.id),
        sourceType: String(row.source_type || 'common_portal'),
        authorityName: String(row.authority_name || ''),
        sourceDomain: String(row.source_domain || ''),
      },
    ])
  );

  const seedListings = [
    {
      listingKey: 'PNB_AHMEDABAD_20260327',
      sourceKey: 'PNB_EAUCTION',
      externalId: 'pnb-ahmedabad-2026-03-27',
      title: 'ARMB Ahmedabad Auction 27.03.2026',
      summary:
        'Official Punjab National Bank sale notice entry for an Ahmedabad auction batch. Use the official page and linked notice before bidding.',
      propertyType: 'commercial',
      bankAuthorityName: 'Punjab National Bank',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate: '2026-03-27T00:00:00+05:30',
      inspectionDate: null,
      stateName: 'Gujarat',
      districtName: 'Ahmedabad',
      cityName: 'Ahmedabad',
      propertyLocation: 'CO Ahmedabad / ARMB Ahmedabad',
      domainStatus: 'verified',
      sortOrder: 10,
    },
    {
      listingKey: 'PNB_LUDHIANA_20260327',
      sourceKey: 'PNB_EAUCTION',
      externalId: 'pnb-ludhiana-2026-03-27',
      title: 'Auction ENG 1 27.03.2026',
      summary:
        'Official Punjab National Bank sale notice listing for a Ludhiana auction window. Open the official page and notice before registration or payment.',
      propertyType: 'mixed',
      bankAuthorityName: 'Punjab National Bank',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate: '2026-03-27T00:00:00+05:30',
      inspectionDate: null,
      stateName: 'Punjab',
      districtName: 'Ludhiana',
      cityName: 'Ludhiana',
      propertyLocation: 'CO Ludhiana',
      domainStatus: 'verified',
      sortOrder: 20,
    },
    {
      listingKey: 'PNB_MANAV_RICE_20260330',
      sourceKey: 'PNB_EAUCTION',
      externalId: 'pnb-manav-rice-2026-03-30',
      title: 'E-auction Notice of M/s Manav Rice',
      summary:
        'Official PNB zonal-office notice tied to an auction event for M/s Manav Rice. Read the official notice and terms carefully before taking action.',
      propertyType: 'industrial',
      bankAuthorityName: 'Punjab National Bank',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate: '2026-03-30T00:00:00+05:30',
      inspectionDate: null,
      stateName: 'Chandigarh',
      districtName: 'Chandigarh',
      cityName: 'Chandigarh',
      propertyLocation: 'ZO Chandigarh',
      domainStatus: 'verified',
      sortOrder: 30,
    },
    {
      listingKey: 'PNB_MURSHIDABAD_20260327',
      sourceKey: 'PNB_EAUCTION',
      externalId: 'pnb-murshidabad-2026-03-27',
      title: 'Circle Office Murshidabad E-Auction Sale 27.03.2026',
      summary:
        'Official Murshidabad circle sale notice listed by Punjab National Bank. Use the official page or notice link for the authoritative auction record.',
      propertyType: 'mixed',
      bankAuthorityName: 'Punjab National Bank',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate: '2026-03-27T00:00:00+05:30',
      inspectionDate: null,
      stateName: 'West Bengal',
      districtName: 'Murshidabad',
      cityName: 'Murshidabad',
      propertyLocation: 'CO Murshidabad',
      domainStatus: 'verified',
      sortOrder: 40,
    },
    {
      listingKey: 'PNB_RAJKOT_20260327',
      sourceKey: 'PNB_EAUCTION',
      externalId: 'pnb-rajkot-2026-03-27',
      title: 'Auction-27.03.26, ENG, D.O.P-11.03.26',
      summary:
        'Official PNB Rajkot circle auction listing. Confirm reserve price, EMD, and property specifics from the official notice before proceeding.',
      propertyType: 'mixed',
      bankAuthorityName: 'Punjab National Bank',
      officialListingUrl: 'https://pnb.bank.in/EAuction.aspx',
      officialDetailUrl: 'https://pnb.bank.in/EAuction.aspx/document/Approved-List.html',
      noticePdfUrl: '',
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: false,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate: '2026-03-27T00:00:00+05:30',
      inspectionDate: null,
      stateName: 'Gujarat',
      districtName: 'Rajkot',
      cityName: 'Rajkot',
      propertyLocation: 'CO Rajkot',
      domainStatus: 'verified',
      sortOrder: 50,
    },
  ];

  for (const listing of seedListings) {
    const source = sourceMap.get(listing.sourceKey);
    if (!source?.id) {
      continue;
    }

    await pool.query(
      `
        UPDATE eauction_listings
        SET
          source_id = $2,
          external_id = $3,
          title = $4,
          summary = $5,
          property_type = $6,
          bank_authority_name = $7,
          source_type = $8,
          official_listing_url = $9,
          official_detail_url = $10,
          notice_pdf_url = $11,
          source_domain = $12,
          login_required = $13,
          bidder_registration_required = $14,
          emd_mentioned = $15,
          reserve_price_amount = $16,
          reserve_price_display = $17,
          emd_amount = $18,
          emd_display = $19,
          auction_date = $20,
          inspection_date = $21,
          state_name = $22,
          district_name = $23,
          city_name = $24,
          property_location = $25,
          domain_status = $26,
          last_checked_at = NOW(),
          is_active = TRUE,
          sort_order = $27
        WHERE listing_key = $1
      `,
      [
        listing.listingKey,
        source.id,
        listing.externalId,
        listing.title,
        listing.summary,
        listing.propertyType,
        listing.bankAuthorityName,
        source.sourceType,
        listing.officialListingUrl,
        listing.officialDetailUrl,
        listing.noticePdfUrl,
        source.sourceDomain,
        Boolean(listing.loginRequired),
        Boolean(listing.bidderRegistrationRequired),
        Boolean(listing.emdMentioned),
        listing.reservePriceAmount,
        listing.reservePriceDisplay,
        listing.emdAmount,
        listing.emdDisplay,
        listing.auctionDate,
        listing.inspectionDate,
        listing.stateName,
        listing.districtName,
        listing.cityName,
        listing.propertyLocation,
        listing.domainStatus,
        listing.sortOrder,
      ]
    );

    await pool.query(
      `
        INSERT INTO eauction_listings (
          listing_key,
          source_id,
          external_id,
          title,
          summary,
          property_type,
          bank_authority_name,
          source_type,
          official_listing_url,
          official_detail_url,
          notice_pdf_url,
          source_domain,
          login_required,
          bidder_registration_required,
          emd_mentioned,
          reserve_price_amount,
          reserve_price_display,
          emd_amount,
          emd_display,
          auction_date,
          inspection_date,
          state_name,
          district_name,
          city_name,
          property_location,
          domain_status,
          last_checked_at,
          is_active,
          sort_order
        )
        SELECT
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          NOW(),
          TRUE,
          $27
        WHERE NOT EXISTS (
          SELECT 1
          FROM eauction_listings
          WHERE listing_key = $1
        )
      `,
      [
        listing.listingKey,
        source.id,
        listing.externalId,
        listing.title,
        listing.summary,
        listing.propertyType,
        listing.bankAuthorityName,
        source.sourceType,
        listing.officialListingUrl,
        listing.officialDetailUrl,
        listing.noticePdfUrl,
        source.sourceDomain,
        Boolean(listing.loginRequired),
        Boolean(listing.bidderRegistrationRequired),
        Boolean(listing.emdMentioned),
        listing.reservePriceAmount,
        listing.reservePriceDisplay,
        listing.emdAmount,
        listing.emdDisplay,
        listing.auctionDate,
        listing.inspectionDate,
        listing.stateName,
        listing.districtName,
        listing.cityName,
        listing.propertyLocation,
        listing.domainStatus,
        listing.sortOrder,
      ]
    );
  }
}

export async function ensureBuilderCompanyTables() {
  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE builder_companies
      ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'builder_companies_type_check'
      ) THEN
        ALTER TABLE builder_companies
          ADD CONSTRAINT builder_companies_type_check
          CHECK (company_type IN ('dealer', 'builder'));
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_builder_companies_updated_at ON builder_companies;');
  await pool.query(`
    CREATE TRIGGER trg_builder_companies_updated_at
    BEFORE UPDATE ON builder_companies
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS company_id BIGINT,
      ADD COLUMN IF NOT EXISTS company_role VARCHAR(20);
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_company_role_check'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_company_role_check
          CHECK (company_role IS NULL OR company_role IN ('owner', 'member'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_company_id_fkey'
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_company_id_fkey
          FOREIGN KEY (company_id)
          REFERENCES builder_companies(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_company_id_idx
      ON users (company_id)
      WHERE company_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builder_projects (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES builder_companies(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      city VARCHAR(120) NOT NULL DEFAULT '',
      location VARCHAR(200) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'builder_projects_status_check'
      ) THEN
        ALTER TABLE builder_projects
          ADD CONSTRAINT builder_projects_status_check
          CHECK (status IN ('pending', 'approved'));
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_builder_projects_updated_at ON builder_projects;');
  await pool.query(`
    CREATE TRIGGER trg_builder_projects_updated_at
    BEFORE UPDATE ON builder_projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_projects_company_id_idx
      ON builder_projects (company_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_projects_status_idx
      ON builder_projects (status);
  `);

  await pool.query(`
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
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_builder_company_banners_updated_at ON builder_company_banners;');
  await pool.query(`
    CREATE TRIGGER trg_builder_company_banners_updated_at
    BEFORE UPDATE ON builder_company_banners
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_company_banners_company_id_idx
      ON builder_company_banners (company_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_company_banners_active_sort_idx
      ON builder_company_banners (is_active, sort_order, created_at);
  `);

  await pool.query(`
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
      verified_at TIMESTAMPTZ,
      verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builder_verification_documents (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      document_type VARCHAR(40) NOT NULL,
      file_url TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'builder_verification_documents_status_check'
      ) THEN
        ALTER TABLE builder_verification_documents
          ADD CONSTRAINT builder_verification_documents_status_check
          CHECK (status IN ('pending', 'approved', 'rejected'));
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_builder_verification_documents_updated_at ON builder_verification_documents;');
  await pool.query(`
    CREATE TRIGGER trg_builder_verification_documents_updated_at
    BEFORE UPDATE ON builder_verification_documents
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    ALTER TABLE companies
      DROP CONSTRAINT IF EXISTS companies_company_type_check;
  `);

  await pool.query(`
    ALTER TABLE companies
      ADD CONSTRAINT companies_company_type_check
      CHECK (company_type IN ('dealer', 'builder', 'owner'));
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;');
  await pool.query(`
    CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
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
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS construction_overall_status VARCHAR(32) NOT NULL DEFAULT 'Planning',
      ADD COLUMN IF NOT EXISTS construction_completion_percent INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS construction_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS construction_last_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS construction_estimated_completion_date DATE,
      ADD COLUMN IF NOT EXISTS construction_schedule_status VARCHAR(24) NOT NULL DEFAULT 'on_schedule',
      ADD COLUMN IF NOT EXISTS construction_delay_reason TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    UPDATE projects
    SET construction_last_updated_at = COALESCE(construction_last_updated_at, updated_at, created_at, NOW())
    WHERE construction_last_updated_at IS NULL;
  `);

  await pool.query(`
    UPDATE projects
    SET construction_completion_percent = LEAST(100, GREATEST(0, COALESCE(construction_completion_percent, 0)))
    WHERE construction_completion_percent < 0
       OR construction_completion_percent > 100;
  `);

  await pool.query(`
    ALTER TABLE builder_projects
      ADD COLUMN IF NOT EXISTS public_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_project_type_check'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_project_type_check
          CHECK (project_type IN ('Apartment', 'Villa', 'Plotted', 'Commercial'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_construction_overall_status_check'
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
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_construction_completion_percent_check'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_construction_completion_percent_check
          CHECK (construction_completion_percent >= 0 AND construction_completion_percent <= 100);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_construction_schedule_status_check'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_construction_schedule_status_check
          CHECK (construction_schedule_status IN ('on_schedule', 'slight_delay', 'major_delay'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_status_check'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT projects_status_check
          CHECK (status IN ('Upcoming', 'Under Construction', 'Ready to Move'));
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;');
  await pool.query(`
    CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_construction_updates_approval_status_check'
      ) THEN
        ALTER TABLE project_construction_updates
          ADD CONSTRAINT project_construction_updates_approval_status_check
          CHECK (approval_status IN ('pending', 'approved', 'rejected'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_construction_updates_photo_count_check'
      ) THEN
        ALTER TABLE project_construction_updates
          ADD CONSTRAINT project_construction_updates_photo_count_check
          CHECK (cardinality(photo_urls) BETWEEN 3 AND 6);
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_project_construction_updates_updated_at ON project_construction_updates;');
  await pool.query(`
    CREATE TRIGGER trg_project_construction_updates_updated_at
    BEFORE UPDATE ON project_construction_updates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
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
  `);

  // Backward compatibility with legacy "properties" table shape.
  await pool.query(`
    ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS company_id BIGINT,
      ADD COLUMN IF NOT EXISTS project_id BIGINT,
      ADD COLUMN IF NOT EXISTS listing_type VARCHAR(16),
      ADD COLUMN IF NOT EXISTS price_per_sqft NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS rent_per_month NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS rent_deposit NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS area VARCHAR(160) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS locality VARCHAR(160) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS full_address TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS landmark VARCHAR(180) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS area_sqft NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS carpet_area NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS builtup_area NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS super_builtup_area NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS bedrooms INT,
      ADD COLUMN IF NOT EXISTS bathrooms INT,
      ADD COLUMN IF NOT EXISTS floor_number INT,
      ADD COLUMN IF NOT EXISTS total_floors INT,
      ADD COLUMN IF NOT EXISTS facing VARCHAR(20) NOT NULL DEFAULT 'NA',
      ADD COLUMN IF NOT EXISTS is_corner BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_vaastu BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS possession_status VARCHAR(40) NOT NULL DEFAULT 'ready',
      ADD COLUMN IF NOT EXISTS rera_number VARCHAR(80) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS furnishing VARCHAR(20) NOT NULL DEFAULT 'na',
      ADD COLUMN IF NOT EXISTS is_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_prelaunch BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS availability_date DATE,
      ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS layout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS posted_by BIGINT,
      ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    UPDATE properties
    SET layout_details = '{}'::jsonb
    WHERE layout_details IS NULL;
  `);

  await pool.query(`
    ALTER TABLE properties
      ALTER COLUMN layout_details SET DEFAULT '{}'::jsonb,
      ALTER COLUMN layout_details SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'properties'
          AND column_name = 'owner_id'
      ) THEN
        UPDATE properties p
        SET created_by_user_id = p.owner_id
        WHERE p.created_by_user_id IS NULL
          AND p.owner_id IS NOT NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'properties'
          AND column_name = 'address'
      ) THEN
        UPDATE properties p
        SET full_address = COALESCE(NULLIF(p.full_address, ''), COALESCE(p.address::TEXT, ''))
        WHERE COALESCE(p.full_address, '') = '';
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE properties
    SET listing_type = 'sale'
    WHERE listing_type IS NULL
       OR BTRIM(listing_type) = '';
  `);

  await pool.query(`
    ALTER TABLE properties
      ALTER COLUMN listing_type SET DEFAULT 'sale',
      ALTER COLUMN listing_type SET NOT NULL;
  `);

  await pool.query(`
    UPDATE properties
    SET posted_by = created_by_user_id
    WHERE posted_by IS NULL
      AND created_by_user_id IS NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'company_id'
      ) THEN
        UPDATE properties p
        SET company_id = u.company_id
        FROM users u
        WHERE p.company_id IS NULL
          AND p.created_by_user_id = u.id
          AND u.company_id IS NOT NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'properties_company_id_fkey'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_company_id_fkey
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_company_id_fkey: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'properties_project_id_fkey'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_project_id_fkey
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_project_id_fkey: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'properties_created_by_user_id_fkey'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_created_by_user_id_fkey
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_created_by_user_id_fkey: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'properties_property_type_check'
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
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_property_type_check: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'properties_listing_type_check'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_listing_type_check
          CHECK (listing_type IN ('sale', 'rent'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_listing_type_check: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'properties_furnishing_check'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_furnishing_check
          CHECK (furnishing IN ('furnished', 'semi_furnished', 'unfurnished', 'na'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_furnishing_check: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'properties_possession_status_check'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_possession_status_check
          CHECK (possession_status IN ('ready', 'under_construction', 'pre_launch', 'resale'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_possession_status_check: %', SQLERRM;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'properties_price_or_rent_check'
      ) THEN
        ALTER TABLE properties
          ADD CONSTRAINT properties_price_or_rent_check
          CHECK (
            (listing_type = 'sale' AND price IS NOT NULL)
            OR (listing_type = 'rent' AND rent_per_month IS NOT NULL)
          );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping properties_price_or_rent_check: %', SQLERRM;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_properties_updated_at ON properties;');
  await pool.query(`
    CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS amenities (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      slug VARCHAR(140) NOT NULL UNIQUE,
      category VARCHAR(40) NOT NULL DEFAULT 'general',
      icon_key VARCHAR(40) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_amenities (
      project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, amenity_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_amenities (
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      PRIMARY KEY (property_id, amenity_id)
    );
  `);

  await pool.query(`
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
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_rentals_updated_at ON rentals;');
  await pool.query(`
    CREATE TRIGGER trg_rentals_updated_at
    BEFORE UPDATE ON rentals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_amenities (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      slug VARCHAR(140) NOT NULL UNIQUE,
      category VARCHAR(40) NOT NULL DEFAULT 'general',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_property_amenities (
      rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      amenity_id BIGINT NOT NULL REFERENCES rental_amenities(id) ON DELETE CASCADE,
      PRIMARY KEY (rental_id, amenity_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rental_leads (
      id BIGSERIAL PRIMARY KEY,
      rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_rentals (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, rental_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_properties (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, property_id)
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leads_lead_type_check'
      ) THEN
        ALTER TABLE leads
          ADD CONSTRAINT leads_lead_type_check
          CHECK (lead_type IN ('general', 'schedule_visit', 'contact_seller', 'make_offer', 'fraud_report'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      agent_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.50,
      commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'commission_status_check'
      ) THEN
        ALTER TABLE commission
          ADD CONSTRAINT commission_status_check
          CHECK (status IN ('pending', 'paid'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listing_promotions (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      promotion_type VARCHAR(24) NOT NULL,
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'listing_promotions_type_check'
      ) THEN
        ALTER TABLE listing_promotions
          ADD CONSTRAINT listing_promotions_type_check
          CHECK (promotion_type IN ('featured', 'verification_badge', 'top_search', 'boost'));
      END IF;
    END $$;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS companies_verified_idx
      ON companies (is_verified, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS companies_verified_at_idx
      ON companies (verified_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS projects_company_idx
      ON projects (company_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS projects_status_idx
      ON projects (status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS projects_construction_last_updated_idx
      ON projects (construction_last_updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_projects_public_project_id_idx
      ON builder_projects (public_project_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS project_construction_updates_project_idx
      ON project_construction_updates (project_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS project_construction_updates_status_idx
      ON project_construction_updates (approval_status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_verification_documents_company_idx
      ON builder_verification_documents (company_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_verification_documents_reviewed_idx
      ON builder_verification_documents (reviewed_by_user_id, reviewed_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_company_idx
      ON properties (company_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_project_idx
      ON properties (project_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_listing_idx
      ON properties (listing_type);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_city_idx
      ON rentals (city);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_locality_idx
      ON rentals (locality);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_rent_idx
      ON rentals (monthly_rent);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_bhk_idx
      ON rentals (bhk);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_type_idx
      ON rentals (property_type);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_model_idx
      ON rentals (rental_model);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_verified_idx
      ON rentals (is_verified, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_featured_idx
      ON rentals (is_featured, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rentals_view_idx
      ON rentals (view_count DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_leads_rental_idx
      ON rental_leads (rental_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rental_bookings_rental_idx
      ON rental_bookings (rental_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS saved_rentals_user_idx
      ON saved_rentals (user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_city_idx
      ON properties (city);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_locality_idx
      ON properties (locality);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_price_idx
      ON properties (price);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_price_per_sqft_idx
      ON properties (price_per_sqft);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_bedrooms_idx
      ON properties (bedrooms);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_type_idx
      ON properties (property_type);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_verified_idx
      ON properties (is_verified, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_featured_idx
      ON properties (is_featured, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS properties_view_count_idx
      ON properties (view_count DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS saved_properties_user_idx
      ON saved_properties (user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS saved_properties_property_idx
      ON saved_properties (property_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_property_idx
      ON leads (property_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_user_idx
      ON leads (user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS commission_property_idx
      ON commission (property_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS commission_agent_idx
      ON commission (agent_id, status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_promotions_property_idx
      ON listing_promotions (property_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS listing_promotions_type_idx
      ON listing_promotions (promotion_type, status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS property_price_history_market_property_idx
      ON property_price_history_market (property_id, created_at DESC);
  `);

  await pool.query(`
    UPDATE builder_companies
    SET name = REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(name, '\\mdevolpers\\M', 'Developers', 'gi'),
          '\\mdevlopers\\M',
          'Developers',
          'gi'
        ),
        '\\mdevolper\\M',
        'Developer',
        'gi'
      ),
      '\\mdevloper\\M',
      'Developer',
      'gi'
    )
    WHERE name ~* '\\m(devolpers|devlopers|devolper|devloper)\\M';
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    UPDATE companies
    SET name = REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(name, '\\mdevolpers\\M', 'Developers', 'gi'),
          '\\mdevlopers\\M',
          'Developers',
          'gi'
        ),
        '\\mdevolper\\M',
        'Developer',
        'gi'
      ),
      '\\mdevloper\\M',
      'Developer',
      'gi'
    )
    WHERE name ~* '\\m(devolpers|devlopers|devolper|devloper)\\M';
  `);

  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('companies', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM companies), 1), 1),
      TRUE
    );
  `);

  for (const amenityName of DEFAULT_AMENITIES) {
    const slug = amenityName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    await pool.query(
      `
        INSERT INTO amenities (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug)
        DO UPDATE SET name = EXCLUDED.name
      `,
      [amenityName, slug]
    );
  }

  for (const amenityName of DEFAULT_RENTAL_AMENITIES) {
    const slug = amenityName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    await pool.query(
      `
        INSERT INTO rental_amenities (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug)
        DO UPDATE SET name = EXCLUDED.name
      `,
      [amenityName, slug]
    );
  }
}

export async function ensureVerificationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS govt_source_registry (
      id BIGSERIAL PRIMARY KEY,
      authority_name VARCHAR(180) NOT NULL,
      source_type VARCHAR(24) NOT NULL DEFAULT 'other',
      source_url TEXT,
      authority_scope VARCHAR(120) NOT NULL DEFAULT '',
      verification_weight INT NOT NULL DEFAULT 5,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builder_verification_cases (
      id BIGSERIAL PRIMARY KEY,
      company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      case_type VARCHAR(32) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      priority VARCHAR(12) NOT NULL DEFAULT 'normal',
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_verification_cases (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
      requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      case_type VARCHAR(32) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      priority VARCHAR(12) NOT NULL DEFAULT 'normal',
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ownership_verification_checks (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      case_id BIGINT REFERENCES property_verification_cases(id) ON DELETE SET NULL,
      owner_name VARCHAR(160) NOT NULL,
      owner_phone VARCHAR(32) NOT NULL DEFAULT '',
      document_type VARCHAR(80) NOT NULL,
      check_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      result_summary VARCHAR(500) NOT NULL DEFAULT '',
      source_authority_id BIGINT REFERENCES govt_source_registry(id) ON DELETE SET NULL,
      checked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fake_listing_reports (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL,
      company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
      property_reference VARCHAR(80) NOT NULL DEFAULT '',
      reporter_name VARCHAR(120) NOT NULL,
      reporter_email VARCHAR(190) NOT NULL DEFAULT '',
      reporter_phone VARCHAR(32) NOT NULL DEFAULT '',
      reason VARCHAR(32) NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      status VARCHAR(16) NOT NULL DEFAULT 'new',
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fraud_actions (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT REFERENCES fake_listing_reports(id) ON DELETE SET NULL,
      action_key VARCHAR(24) NOT NULL,
      action_note TEXT NOT NULL DEFAULT '',
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'govt_source_registry_type_check') THEN
        ALTER TABLE govt_source_registry
          ADD CONSTRAINT govt_source_registry_type_check
          CHECK (source_type IN ('government_portal', 'rera', 'bank_portal', 'municipal', 'court_notice', 'other'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'govt_source_registry_weight_check') THEN
        ALTER TABLE govt_source_registry
          ADD CONSTRAINT govt_source_registry_weight_check
          CHECK (verification_weight BETWEEN 0 AND 20);
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_verification_cases_status_check') THEN
        ALTER TABLE builder_verification_cases
          ADD CONSTRAINT builder_verification_cases_status_check
          CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_changes'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_verification_cases_priority_check') THEN
        ALTER TABLE builder_verification_cases
          ADD CONSTRAINT builder_verification_cases_priority_check
          CHECK (priority IN ('low', 'normal', 'high'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_verification_cases_case_type_check') THEN
        ALTER TABLE builder_verification_cases
          ADD CONSTRAINT builder_verification_cases_case_type_check
          CHECK (case_type IN ('kyc', 'rera', 'project_document', 'ownership', 'banking', 'site_audit'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_verification_cases_status_check') THEN
        ALTER TABLE property_verification_cases
          ADD CONSTRAINT property_verification_cases_status_check
          CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_changes'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_verification_cases_priority_check') THEN
        ALTER TABLE property_verification_cases
          ADD CONSTRAINT property_verification_cases_priority_check
          CHECK (priority IN ('low', 'normal', 'high'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_verification_cases_case_type_check') THEN
        ALTER TABLE property_verification_cases
          ADD CONSTRAINT property_verification_cases_case_type_check
          CHECK (case_type IN ('listing_authenticity', 'ownership', 'pricing', 'location', 'rera', 'media'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_verification_checks_status_check') THEN
        ALTER TABLE ownership_verification_checks
          ADD CONSTRAINT ownership_verification_checks_status_check
          CHECK (check_status IN ('pending', 'verified', 'failed', 'manual_review'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fake_listing_reports_reason_check') THEN
        ALTER TABLE fake_listing_reports
          ADD CONSTRAINT fake_listing_reports_reason_check
          CHECK (reason IN ('duplicate_listing', 'wrong_price', 'wrong_location', 'ownership_doubt', 'scam_behavior', 'fake_media', 'other'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fake_listing_reports_status_check') THEN
        ALTER TABLE fake_listing_reports
          ADD CONSTRAINT fake_listing_reports_status_check
          CHECK (status IN ('new', 'reviewing', 'resolved', 'rejected'));
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fraud_actions_key_check') THEN
        ALTER TABLE fraud_actions
          ADD CONSTRAINT fraud_actions_key_check
          CHECK (action_key IN ('flag_listing', 'warn_builder', 'reject_report', 'resolve_report', 'suspend_listing', 'keep_listing_live'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS govt_source_registry_source_url_unique
      ON govt_source_registry (source_url)
      WHERE source_url IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS builder_verification_cases_company_status_idx
      ON builder_verification_cases (company_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS property_verification_cases_property_status_idx
      ON property_verification_cases (property_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ownership_verification_checks_property_checked_idx
      ON ownership_verification_checks (property_id, checked_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS fake_listing_reports_open_idx
      ON fake_listing_reports (status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS fake_listing_reports_property_idx
      ON fake_listing_reports (property_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS fraud_actions_report_idx
      ON fraud_actions (report_id, created_at DESC);
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_govt_source_registry_updated_at ON govt_source_registry;');
  await pool.query(`
    CREATE TRIGGER trg_govt_source_registry_updated_at
    BEFORE UPDATE ON govt_source_registry
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_builder_verification_cases_updated_at ON builder_verification_cases;');
  await pool.query(`
    CREATE TRIGGER trg_builder_verification_cases_updated_at
    BEFORE UPDATE ON builder_verification_cases
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_property_verification_cases_updated_at ON property_verification_cases;');
  await pool.query(`
    CREATE TRIGGER trg_property_verification_cases_updated_at
    BEFORE UPDATE ON property_verification_cases
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fake_listing_reports_updated_at ON fake_listing_reports;');
  await pool.query(`
    CREATE TRIGGER trg_fake_listing_reports_updated_at
    BEFORE UPDATE ON fake_listing_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);
}

export async function ensureLayoutUnitTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS floors (
      id BIGSERIAL PRIMARY KEY,
      building_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      floor_number INT NOT NULL,
      floor_name VARCHAR(80) NOT NULL DEFAULT '',
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT floors_building_floor_unique UNIQUE (building_id, floor_number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS layout_files (
      id BIGSERIAL PRIMARY KEY,
      floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
      file_url TEXT NOT NULL,
      file_type VARCHAR(16) NOT NULL DEFAULT 'image',
      mime_type VARCHAR(80) NOT NULL,
      file_size_bytes BIGINT NOT NULL DEFAULT 0,
      original_name VARCHAR(180) NOT NULL DEFAULT '',
      uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'layout_files_file_type_check'
      ) THEN
        ALTER TABLE layout_files
          ADD CONSTRAINT layout_files_file_type_check
          CHECK (file_type IN ('image', 'pdf'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS units (
      id BIGSERIAL PRIMARY KEY,
      floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
      layout_file_id BIGINT REFERENCES layout_files(id) ON DELETE SET NULL,
      unit_number VARCHAR(50) NOT NULL,
      unit_type VARCHAR(24) NOT NULL,
      category VARCHAR(24) NOT NULL,
      listing_type VARCHAR(16) NOT NULL,
      area_covered NUMERIC(14, 2) NOT NULL,
      rent_amount NUMERIC(14, 2),
      deposit_amount NUMERIC(14, 2),
      maintenance_amount NUMERIC(14, 2),
      sale_price NUMERIC(14, 2),
      lease_amount NUMERIC(14, 2),
      status VARCHAR(20) NOT NULL DEFAULT 'Available',
      occupied_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      notes VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT units_floor_unit_unique UNIQUE (floor_id, unit_number)
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_unit_type_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_unit_type_check
          CHECK (unit_type IN ('Flat', 'Room', 'Shop', 'Office'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_category_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_category_check
          CHECK (category IN ('Residential', 'Commercial'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_listing_type_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_listing_type_check
          CHECK (listing_type IN ('Rent', 'Sale', 'Lease'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_status_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_status_check
          CHECK (status IN ('Available', 'Occupied', 'Maintenance'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_pricing_requirements_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_pricing_requirements_check
          CHECK (
            (listing_type <> 'Rent' OR rent_amount IS NOT NULL)
            AND (listing_type <> 'Sale' OR sale_price IS NOT NULL)
            AND (listing_type <> 'Lease' OR lease_amount IS NOT NULL)
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_occupied_tenant_check'
      ) THEN
        ALTER TABLE units
          ADD CONSTRAINT units_occupied_tenant_check
          CHECK (
            (status <> 'Occupied')
            OR (occupied_by_user_id IS NOT NULL)
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_amenities (
      unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (unit_id, amenity_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS layout_markers (
      id BIGSERIAL PRIMARY KEY,
      floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
      unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      marker_x NUMERIC(8, 4) NOT NULL,
      marker_y NUMERIC(8, 4) NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT layout_markers_floor_unit_unique UNIQUE (floor_id, unit_id)
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'layout_markers_xy_range_check'
      ) THEN
        ALTER TABLE layout_markers
          ADD CONSTRAINT layout_markers_xy_range_check
          CHECK (
            marker_x >= 0 AND marker_x <= 100
            AND marker_y >= 0 AND marker_y <= 100
          );
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_floors_updated_at ON floors;');
  await pool.query(`
    CREATE TRIGGER trg_floors_updated_at
    BEFORE UPDATE ON floors
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_layout_files_updated_at ON layout_files;');
  await pool.query(`
    CREATE TRIGGER trg_layout_files_updated_at
    BEFORE UPDATE ON layout_files
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_units_updated_at ON units;');
  await pool.query(`
    CREATE TRIGGER trg_units_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_unit_amenities_updated_at ON unit_amenities;');
  await pool.query(`
    CREATE TRIGGER trg_unit_amenities_updated_at
    BEFORE UPDATE ON unit_amenities
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_layout_markers_updated_at ON layout_markers;');
  await pool.query(`
    CREATE TRIGGER trg_layout_markers_updated_at
    BEFORE UPDATE ON layout_markers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS floors_building_idx
      ON floors (building_id, floor_number);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS layout_files_floor_created_idx
      ON layout_files (floor_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS units_floor_status_idx
      ON units (floor_id, status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS units_listing_type_idx
      ON units (listing_type);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS layout_markers_floor_idx
      ON layout_markers (floor_id, updated_at DESC);
  `);
}

export async function ensureApartmentComplexTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buildings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(180) NOT NULL,
      address TEXT NOT NULL,
      type VARCHAR(20) NOT NULL,
      is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      sold_at TIMESTAMPTZ,
      sold_note TEXT,
      sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE buildings
      ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sold_note TEXT,
      ADD COLUMN IF NOT EXISTS sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      floor_number INT NOT NULL DEFAULT 1,
      room_label VARCHAR(80) NOT NULL,
      rent_amount NUMERIC(14, 2) NOT NULL,
      tenant_name VARCHAR(160),
      tenant_phone VARCHAR(40),
      tenant_joined_on DATE,
      rent_due_day INT,
      is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      sold_at TIMESTAMPTZ,
      sold_note TEXT,
      sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT rooms_building_floor_room_label_unique UNIQUE (building_id, floor_number, room_label)
    );
  `);

  await pool.query(`
    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS floor_number INT;
  `);
  await pool.query(`
    UPDATE rooms
    SET floor_number = 1
    WHERE floor_number IS NULL;
  `);
  await pool.query(`
    ALTER TABLE rooms
      ALTER COLUMN floor_number SET DEFAULT 1,
      ALTER COLUMN floor_number SET NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS rent_due_day INT;
  `);
  await pool.query(`
    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS tenant_joined_on DATE;
  `);
  await pool.query(`
    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sold_note TEXT,
      ADD COLUMN IF NOT EXISTS sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rent_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      month_key VARCHAR(7) NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'unpaid',
      due_date DATE,
      paid_date DATE,
      amount_paid NUMERIC(14, 2),
      penalty_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      penalty_applied_at TIMESTAMPTZ,
      payment_method VARCHAR(10),
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT rent_payments_room_month_unique UNIQUE (room_id, month_key)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartment_rent_auto_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      month_key VARCHAR(7) NOT NULL,
      due_date DATE,
      tenant_phone VARCHAR(40) NOT NULL DEFAULT '',
      message_body TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT apartment_rent_auto_alerts_room_month_unique UNIQUE (room_id, month_key)
    );
  `);
  await pool.query(`
    ALTER TABLE rent_payments
      ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS penalty_applied_at TIMESTAMPTZ;
  `);
  await pool.query(`
    WITH first_due AS (
      SELECT DISTINCT ON (room_id)
        room_id,
        EXTRACT(DAY FROM due_date)::INT AS due_day
      FROM rent_payments
      WHERE due_date IS NOT NULL
      ORDER BY room_id, month_key ASC
    )
    UPDATE rooms r
    SET rent_due_day = fd.due_day
    FROM first_due fd
    WHERE r.id = fd.room_id
      AND r.rent_due_day IS NULL;
  `);
  await pool.query(`
    WITH first_payment_month AS (
      SELECT
        rp.room_id,
        MIN(to_date(rp.month_key || '-01', 'YYYY-MM-DD'))::DATE AS first_month
      FROM rent_payments rp
      GROUP BY rp.room_id
    ),
    candidates AS (
      SELECT
        r.id,
        COALESCE(fpm.first_month, r.created_at::DATE, CURRENT_DATE) AS joined_on
      FROM rooms r
      LEFT JOIN first_payment_month fpm
        ON fpm.room_id = r.id
      WHERE r.tenant_joined_on IS NULL
        AND (
          TRIM(COALESCE(r.tenant_name, '')) <> ''
          OR TRIM(COALESCE(r.tenant_phone, '')) <> ''
        )
    )
    UPDATE rooms r
    SET tenant_joined_on = c.joined_on
    FROM candidates c
    WHERE r.id = c.id;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'buildings_type_check'
      ) THEN
        ALTER TABLE buildings
          ADD CONSTRAINT buildings_type_check
          CHECK (type IN ('residential', 'commercial', 'mixed'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_rent_positive_check'
      ) THEN
        ALTER TABLE rooms
          ADD CONSTRAINT rooms_rent_positive_check
          CHECK (rent_amount > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_floor_positive_check'
      ) THEN
        ALTER TABLE rooms
          ADD CONSTRAINT rooms_floor_positive_check
          CHECK (floor_number >= 1);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_due_day_check'
      ) THEN
        ALTER TABLE rooms
          ADD CONSTRAINT rooms_due_day_check
          CHECK (rent_due_day IS NULL OR (rent_due_day >= 1 AND rent_due_day <= 31));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_building_room_label_unique'
      ) THEN
        ALTER TABLE rooms
          DROP CONSTRAINT rooms_building_room_label_unique;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_building_floor_room_label_unique'
      ) THEN
        ALTER TABLE rooms
          ADD CONSTRAINT rooms_building_floor_room_label_unique
          UNIQUE (building_id, floor_number, room_label);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_status_check'
      ) THEN
        ALTER TABLE rent_payments
          ADD CONSTRAINT rent_payments_status_check
          CHECK (status IN ('paid', 'unpaid'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_month_key_check'
      ) THEN
        ALTER TABLE rent_payments
          ADD CONSTRAINT rent_payments_month_key_check
          CHECK (month_key ~ '^\\d{4}-(0[1-9]|1[0-2])$');
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_payment_method_check'
      ) THEN
        ALTER TABLE rent_payments
          ADD CONSTRAINT rent_payments_payment_method_check
          CHECK (
            payment_method IS NULL
            OR payment_method IN ('cash', 'upi', 'bank')
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_amount_positive_check'
      ) THEN
        ALTER TABLE rent_payments
          ADD CONSTRAINT rent_payments_amount_positive_check
          CHECK (amount_paid IS NULL OR amount_paid > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_penalty_nonnegative_check'
      ) THEN
        ALTER TABLE rent_payments
          ADD CONSTRAINT rent_payments_penalty_nonnegative_check
          CHECK (penalty_amount >= 0);
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'apartment_rent_auto_alerts_month_key_check'
      ) THEN
        ALTER TABLE apartment_rent_auto_alerts
          ADD CONSTRAINT apartment_rent_auto_alerts_month_key_check
          CHECK (month_key ~ '^\\d{4}-(0[1-9]|1[0-2])$');
      END IF;
    END $$;
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_rent_payments_updated_at ON rent_payments;');
  await pool.query(`
    CREATE TRIGGER trg_rent_payments_updated_at
    BEFORE UPDATE ON rent_payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS buildings_created_idx
      ON buildings (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS buildings_sold_idx
      ON buildings (is_sold, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rooms_building_idx
      ON rooms (building_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rooms_building_floor_idx
      ON rooms (building_id, floor_number, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rooms_sold_idx
      ON rooms (is_sold, building_id, floor_number, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rent_payments_room_month_idx
      ON rent_payments (room_id, month_key);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rent_payments_month_status_idx
      ON rent_payments (month_key, status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rent_payments_due_status_idx
      ON rent_payments (status, due_date);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS apartment_rent_auto_alerts_month_idx
      ON apartment_rent_auto_alerts (month_key, sent_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS apartment_rent_auto_alerts_sent_idx
      ON apartment_rent_auto_alerts (sent_at DESC);
  `);
}

export async function ensureInsightsTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(140) NOT NULL,
      rss_url TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      image_url TEXT,
      snippet TEXT,
      category VARCHAR(80),
      published_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 days'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE news_articles
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 days');
  `);

  await pool.query(`
    UPDATE news_articles
    SET expires_at = COALESCE(published_at, created_at, NOW()) + INTERVAL '10 days'
    WHERE expires_at IS NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_clicks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id UUID NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builder_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      builder_name VARCHAR(160) NOT NULL,
      source_type VARCHAR(20) NOT NULL DEFAULT 'rss',
      source_url TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS news_articles_created_idx
      ON news_articles (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS news_articles_source_idx
      ON news_articles (source_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS news_articles_expires_idx
      ON news_articles (expires_at ASC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS news_clicks_article_idx
      ON news_clicks (article_id, clicked_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS market_city_prices_city_period_idx
      ON market_city_prices (city, period DESC, fetched_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS project_announcements_source_idx
      ON project_announcements (builder_source_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS project_announcements_city_idx
      ON project_announcements (city, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS job_runs_job_started_idx
      ON job_runs (job_name, started_at DESC);
  `);
}

export async function ensureInfrastructureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS infra_updates (
      id BIGSERIAL PRIMARY KEY,
      state VARCHAR(80) NOT NULL,
      district VARCHAR(120) NOT NULL,
      cities TEXT[] NOT NULL,
      category VARCHAR(30) NOT NULL,
      project_name VARCHAR(200) NOT NULL,
      authority VARCHAR(120) NOT NULL,
      project_type VARCHAR(120) NOT NULL,
      status_text TEXT NOT NULL,
      impact_level VARCHAR(20) NOT NULL,
      source_ref TEXT NOT NULL,
      source_url TEXT,
      verification_level VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
      last_updated DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE infra_updates
      ADD COLUMN IF NOT EXISTS source_url TEXT,
      ADD COLUMN IF NOT EXISTS verification_level VARCHAR(30);
  `);

  await pool.query(`
    UPDATE infra_updates
    SET verification_level = UPPER(TRIM(verification_level))
    WHERE COALESCE(TRIM(verification_level), '') <> '';
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    UPDATE infra_updates
    SET verification_level = 'SOURCE_ONLY'
    WHERE verification_level = 'UNKNOWN'
      AND COALESCE(TRIM(source_url), '') <> ''
      AND COALESCE(TRIM(source_ref), '') <> '';
  `);

  await pool.query(`
    ALTER TABLE infra_updates
      ALTER COLUMN verification_level SET DEFAULT 'UNKNOWN',
      ALTER COLUMN verification_level SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'infra_updates_category_enum_check'
      ) THEN
        ALTER TABLE infra_updates
          ADD CONSTRAINT infra_updates_category_enum_check
          CHECK (category IN ('PROPOSED', 'APPROVED', 'UNDER_CONSTRUCTION', 'COMPLETED'));
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE infra_updates
      DROP CONSTRAINT IF EXISTS infra_updates_verification_level_enum_check;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'infra_updates_impact_level_enum_check'
      ) THEN
        ALTER TABLE infra_updates
          ADD CONSTRAINT infra_updates_impact_level_enum_check
          CHECK (impact_level IN ('LOW', 'MEDIUM', 'HIGH'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_state_district
      ON infra_updates (state, district);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_state
      ON infra_updates (state);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_district
      ON infra_updates (district);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_category
      ON infra_updates (category);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_verification_level
      ON infra_updates (verification_level);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_state_verification_last_updated
      ON infra_updates (state, verification_level, last_updated DESC, id DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_last_updated
      ON infra_updates (last_updated DESC, id DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_cities_gin
      ON infra_updates USING GIN (cities);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS infra_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      state VARCHAR(80) NOT NULL,
      district VARCHAR(120) NOT NULL,
      city VARCHAR(120) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      contact VARCHAR(200) NOT NULL,
      consent BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      unsubscribe_token TEXT,
      unsubscribed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'infra_subscriptions_channel_check'
      ) THEN
        ALTER TABLE infra_subscriptions
          ADD CONSTRAINT infra_subscriptions_channel_check
          CHECK (channel IN ('WHATSAPP', 'EMAIL'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_subs_city
      ON infra_subscriptions (state, district, city);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_infra_subs_active_created
      ON infra_subscriptions (is_active, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_subs_unsub_token
      ON infra_subscriptions (unsubscribe_token)
      WHERE unsubscribe_token IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS infra_ingest_items (
      id BIGSERIAL PRIMARY KEY,
      source_key VARCHAR(80) NOT NULL,
      item_guid TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      summary TEXT,
      raw JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'NEW',
      published_update_id BIGINT,
      ignored_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT infra_ingest_items_source_guid_unique UNIQUE (source_key, item_guid)
    );
  `);

  await pool.query(`
    ALTER TABLE infra_ingest_items
      ADD COLUMN IF NOT EXISTS content_hash TEXT,
      ADD COLUMN IF NOT EXISTS published_update_id BIGINT,
      ADD COLUMN IF NOT EXISTS ignored_reason TEXT;
  `);

  await pool.query(`
    UPDATE infra_ingest_items
    SET content_hash = MD5(
      COALESCE(LOWER(TRIM(title)), '') || '||' ||
      COALESCE(LOWER(TRIM(link)), '') || '||' ||
      COALESCE(LOWER(TRIM(summary)), '') || '||' ||
      COALESCE(TO_CHAR(published_at, 'YYYY-MM-DD'), '') || '||' ||
      COALESCE(LOWER(TRIM(item_guid)), '')
    )
    WHERE content_hash IS NULL
       OR COALESCE(TRIM(content_hash), '') = '';
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT
        id,
        source_key,
        content_hash,
        ROW_NUMBER() OVER (
          PARTITION BY source_key, content_hash
          ORDER BY id ASC
        ) AS rn
      FROM infra_ingest_items
    )
    UPDATE infra_ingest_items AS target
    SET content_hash = target.content_hash || '-' || target.id::text
    FROM ranked
    WHERE ranked.id = target.id
      AND ranked.rn > 1;
  `);

  await pool.query(`
    ALTER TABLE infra_ingest_items
      ALTER COLUMN content_hash SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'infra_ingest_items_status_check'
      ) THEN
        ALTER TABLE infra_ingest_items
          ADD CONSTRAINT infra_ingest_items_status_check
          CHECK (status IN ('NEW', 'IGNORED', 'PUBLISHED'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ingest_status_created
      ON infra_ingest_items (status, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_source_hash_unique
      ON infra_ingest_items (source_key, content_hash);
  `);
}

export async function ensureTenderIntelligenceTables() {
  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_sources_track
      ON tender_intelligence_sources (track, is_active, priority_order);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_sources_type
      ON tender_intelligence_sources (source_type, is_active);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_intelligence_records_record_hash_unique
      ON tender_intelligence_records (record_hash)
      WHERE record_hash IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_track_type
      ON tender_intelligence_records (track, source_type, published_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_location_codes
      ON tender_intelligence_records (
        lgd_state_code,
        lgd_district_code,
        lgd_block_code,
        lgd_village_code
      );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_dates
      ON tender_intelligence_records (published_at DESC, bid_end_at DESC, opening_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_status
      ON tender_intelligence_records (verification_level, parser_status, moderation_status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_records_budget
      ON tender_intelligence_records (budget_amount DESC NULLS LAST, impact_score DESC);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_documents_record
      ON tender_intelligence_documents (record_id, document_type, created_at DESC);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_history_record
      ON tender_intelligence_history (record_id, event_at DESC);
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tender_intelligence_source_health_logs_source
      ON tender_intelligence_source_health_logs (source_id, checked_at DESC);
  `);
}

export async function ensureTenderIntelligenceSourceSeeds() {
  await pool.query(`
    INSERT INTO tender_intelligence_sources (
      source_key,
      track,
      source_type,
      source_name,
      source_url,
      collection_method,
      verification_level,
      coverage_scope,
      coverage_state_name,
      priority_order,
      refresh_interval_minutes,
      is_active,
      notes
    )
    VALUES
      (
        'CPPP_EPROCURE',
        'government',
        'government_tender',
        'Central Public Procurement Portal (CPPP / eProcure)',
        'https://eprocure.gov.in/eprocure/app',
        'html',
        'OFFICIAL_PORTAL',
        'national',
        NULL,
        10,
        60,
        TRUE,
        'Primary national government tender backbone for phase 1.'
      ),
      (
        'GEM_BIDS',
        'government',
        'government_tender',
        'Government e Marketplace (GeM) Bids',
        'https://gem.gov.in/',
        'html',
        'OFFICIAL_PORTAL',
        'national',
        NULL,
        20,
        60,
        TRUE,
        'Separate government tender stream; keep trust labeling aligned with official GeM pages.'
      ),
      (
        'KARNATAKA_KPPP',
        'government',
        'government_tender',
        'Karnataka Public Procurement Portal (KPPP)',
        'https://kppp.karnataka.gov.in/',
        'html',
        'OFFICIAL_PORTAL',
        'state',
        'Karnataka',
        30,
        60,
        TRUE,
        'State procurement backbone for Karnataka-first rollout.'
      ),
      (
        'PIB_INFRA',
        'government',
        'government_notice',
        'Press Information Bureau Infrastructure Announcements',
        'https://pib.gov.in/',
        'rss',
        'PUBLIC_NOTICE_PRESS_RELEASE',
        'national',
        NULL,
        40,
        180,
        TRUE,
        'Used for official announcements, approvals, and press-release style updates.'
      ),
      (
        'LGD_DIRECTORY',
        'government',
        'village_signal',
        'Local Government Directory (LGD)',
        'https://lgdirectory.gov.in/',
        'hybrid',
        'OFFICIAL_DEPARTMENT_SITE',
        'national',
        NULL,
        50,
        1440,
        TRUE,
        'Location normalization backbone for state, district, block, and village codes.'
      ),
      (
        'KARNATAKA_DEPT_TENDERS',
        'government',
        'government_tender',
        'Karnataka Department Tender Pages',
        'https://www.karnataka.gov.in/',
        'html',
        'OFFICIAL_DEPARTMENT_SITE',
        'state',
        'Karnataka',
        60,
        360,
        TRUE,
        'Use after CPPP and KPPP coverage is stable.'
      ),
      (
        'KARNATAKA_LOCAL_BODIES',
        'government',
        'government_notice',
        'Karnataka District and Local Body Websites',
        'https://www.karnataka.gov.in/english',
        'html',
        'OFFICIAL_DEPARTMENT_SITE',
        'district',
        'Karnataka',
        70,
        1440,
        TRUE,
        'Lower-frequency crawl tier for district and local-government updates.'
      ),
      (
        'PRIVATE_MARKET_PORTALS',
        'private',
        'private_opportunity',
        'Private Tender and Market Opportunity Portals',
        'https://www.tenderdetail.com/',
        'html',
        'MARKET_SOURCE',
        'private_network',
        NULL,
        80,
        720,
        FALSE,
        'Keep private opportunities separated from government trust badges until the module is enabled.'
      ),
      (
        'INFRA_LEGACY_PUBLIC',
        'government',
        'government_notice',
        'Legacy Public Infrastructure Feed',
        'https://example.invalid/legacy-public-feed',
        'manual',
        'OFFICIAL_DEPARTMENT_SITE',
        'national',
        NULL,
        500,
        60,
        TRUE,
        'Fallback registry entry for existing infra_updates rows until a more specific source is known.'
      )
    ON CONFLICT (source_key)
    DO UPDATE
      SET track = EXCLUDED.track,
          source_type = EXCLUDED.source_type,
          source_name = EXCLUDED.source_name,
          source_url = EXCLUDED.source_url,
          collection_method = EXCLUDED.collection_method,
          verification_level = EXCLUDED.verification_level,
          coverage_scope = EXCLUDED.coverage_scope,
          coverage_state_name = EXCLUDED.coverage_state_name,
          priority_order = EXCLUDED.priority_order,
          refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
          is_active = EXCLUDED.is_active,
          notes = EXCLUDED.notes,
          updated_at = NOW();
  `);
}

export async function ensureGroupDealsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_deals (
      id BIGSERIAL PRIMARY KEY,
      deal_code VARCHAR(40) NOT NULL UNIQUE,
      property_id BIGINT,
      project_name VARCHAR(200) NOT NULL,
      builder_name VARCHAR(160) NOT NULL,
      builder_verified BOOLEAN NOT NULL DEFAULT FALSE,
      builder_contact_name VARCHAR(120) NOT NULL DEFAULT '',
      builder_contact_phone VARCHAR(32) NOT NULL DEFAULT '',
      builder_contact_email VARCHAR(190) NOT NULL DEFAULT '',
      state_code VARCHAR(20) NOT NULL,
      state_name VARCHAR(120) NOT NULL,
      city_name VARCHAR(120) NOT NULL,
      unit_type VARCHAR(20) NOT NULL,
      base_price NUMERIC(14, 2),
      deal_type VARCHAR(24) NOT NULL,
      discount_value NUMERIC(12, 2),
      min_buyers INT NOT NULL DEFAULT 2,
      max_buyers INT,
      joined_buyers_count INT NOT NULL DEFAULT 0,
      valid_until TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      final_group_price NUMERIC(14, 2),
      final_discount_note TEXT NOT NULL DEFAULT '',
      booking_process_steps TEXT NOT NULL DEFAULT '',
      terms_confirmed_at TIMESTAMPTZ,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE group_deals
      ADD COLUMN IF NOT EXISTS property_id BIGINT,
      ADD COLUMN IF NOT EXISTS builder_contact_name VARCHAR(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS builder_contact_phone VARCHAR(32) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS builder_contact_email VARCHAR(190) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS final_group_price NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS final_discount_note TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS booking_process_steps TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS terms_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_status_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_status_check
      CHECK (
        status IN ('ACTIVE', 'MIN_REACHED', 'CONFIRMED', 'FULL', 'EXPIRED', 'PAUSED', 'CANCELLED')
      );
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_unit_type_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_unit_type_check
      CHECK (unit_type IN ('2BHK', '3BHK', 'SHOP', 'PLOT'));
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_deal_type_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_deal_type_check
      CHECK (deal_type IN ('FLAT_DISCOUNT', 'PERCENT_DISCOUNT', 'CONFIRM_LATER'));
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_discount_value_required_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_discount_value_required_check
      CHECK (
        (deal_type = 'CONFIRM_LATER')
        OR (discount_value IS NOT NULL AND discount_value > 0)
      );
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_percent_discount_range_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_percent_discount_range_check
      CHECK (
        deal_type <> 'PERCENT_DISCOUNT'
        OR discount_value <= 100
      );
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_base_price_positive_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_base_price_positive_check
      CHECK (base_price IS NULL OR base_price > 0);
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_final_group_price_positive_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_final_group_price_positive_check
      CHECK (final_group_price IS NULL OR final_group_price > 0);
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_min_buyers_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_min_buyers_check
      CHECK (min_buyers >= 2);
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_max_buyers_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_max_buyers_check
      CHECK (
        max_buyers IS NULL
        OR max_buyers >= min_buyers
      );
  `);

  await pool.query(`
    ALTER TABLE group_deals
      DROP CONSTRAINT IF EXISTS group_deals_joined_buyers_non_negative_check;
  `);
  await pool.query(`
    ALTER TABLE group_deals
      ADD CONSTRAINT group_deals_joined_buyers_non_negative_check
      CHECK (joined_buyers_count >= 0);
  `);

  await pool.query(`
    UPDATE group_deals
    SET status = 'EXPIRED',
        updated_at = NOW()
    WHERE status IN ('ACTIVE', 'MIN_REACHED')
      AND valid_until < NOW();
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_group_deals_updated_at ON group_deals;');
  await pool.query(`
    CREATE TRIGGER trg_group_deals_updated_at
    BEFORE UPDATE ON group_deals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deals_public_idx
      ON group_deals (status, valid_until, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deals_state_unit_idx
      ON group_deals (state_code, unit_type, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deals_builder_verified_idx
      ON group_deals (builder_verified, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deals_property_idx
      ON group_deals (property_id, status, valid_until);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_deal_joins (
      id BIGSERIAL PRIMARY KEY,
      deal_id BIGINT NOT NULL REFERENCES group_deals(id) ON DELETE CASCADE,
      full_name VARCHAR(120) NOT NULL,
      phone VARCHAR(32) NOT NULL DEFAULT '',
      email VARCHAR(190) NOT NULL DEFAULT '',
      normalized_phone VARCHAR(32) NOT NULL DEFAULT '',
      normalized_email VARCHAR(190) NOT NULL DEFAULT '',
      unit_preference VARCHAR(20) NOT NULL,
      consent BOOLEAN NOT NULL DEFAULT TRUE,
      allow_builder_contact_before_completion BOOLEAN NOT NULL DEFAULT FALSE,
      join_status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
      source_ip VARCHAR(64) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE group_deal_joins
      ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(32) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS normalized_email VARCHAR(190) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS allow_builder_contact_before_completion BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS join_status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
      ADD COLUMN IF NOT EXISTS source_ip VARCHAR(64) NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE group_deal_joins
      DROP CONSTRAINT IF EXISTS group_deal_joins_unit_preference_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_joins
      ADD CONSTRAINT group_deal_joins_unit_preference_check
      CHECK (unit_preference IN ('2BHK', '3BHK', 'SHOP', 'PLOT'));
  `);

  await pool.query(`
    ALTER TABLE group_deal_joins
      DROP CONSTRAINT IF EXISTS group_deal_joins_join_status_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_joins
      ADD CONSTRAINT group_deal_joins_join_status_check
      CHECK (join_status IN ('JOINED', 'WITHDRAWN'));
  `);

  await pool.query(`
    ALTER TABLE group_deal_joins
      DROP CONSTRAINT IF EXISTS group_deal_joins_contact_required_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_joins
      ADD CONSTRAINT group_deal_joins_contact_required_check
      CHECK (
        COALESCE(TRIM(phone), '') <> ''
        OR COALESCE(TRIM(email), '') <> ''
      );
  `);

  await pool.query(`
    ALTER TABLE group_deal_joins
      DROP CONSTRAINT IF EXISTS group_deal_joins_consent_true_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_joins
      ADD CONSTRAINT group_deal_joins_consent_true_check
      CHECK (consent = TRUE);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_joins_deal_idx
      ON group_deal_joins (deal_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_joins_phone_idx
      ON group_deal_joins (normalized_phone, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_joins_email_idx
      ON group_deal_joins (normalized_email, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS group_deal_joins_active_phone_unique_idx
      ON group_deal_joins (deal_id, normalized_phone)
      WHERE normalized_phone <> ''
        AND join_status = 'JOINED';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS group_deal_joins_active_email_unique_idx
      ON group_deal_joins (deal_id, normalized_email)
      WHERE normalized_email <> ''
        AND join_status = 'JOINED';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_deal_requests (
      id BIGSERIAL PRIMARY KEY,
      property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      full_name VARCHAR(120) NOT NULL,
      phone VARCHAR(32) NOT NULL DEFAULT '',
      email VARCHAR(190) NOT NULL DEFAULT '',
      normalized_phone VARCHAR(32) NOT NULL DEFAULT '',
      normalized_email VARCHAR(190) NOT NULL DEFAULT '',
      consent BOOLEAN NOT NULL DEFAULT TRUE,
      request_note TEXT NOT NULL DEFAULT '',
      status VARCHAR(24) NOT NULL DEFAULT 'NEW',
      source VARCHAR(40) NOT NULL DEFAULT 'property_card',
      source_ip VARCHAR(64) NOT NULL DEFAULT '',
      created_deal_id BIGINT REFERENCES group_deals(id) ON DELETE SET NULL,
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE group_deal_requests
      ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(32) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS normalized_email VARCHAR(190) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS request_note TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'property_card',
      ADD COLUMN IF NOT EXISTS source_ip VARCHAR(64) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_deal_id BIGINT REFERENCES group_deals(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    ALTER TABLE group_deal_requests
      DROP CONSTRAINT IF EXISTS group_deal_requests_status_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_requests
      ADD CONSTRAINT group_deal_requests_status_check
      CHECK (status IN ('NEW', 'APPROVED', 'REJECTED', 'AUTO_CREATED'));
  `);

  await pool.query(`
    ALTER TABLE group_deal_requests
      DROP CONSTRAINT IF EXISTS group_deal_requests_contact_required_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_requests
      ADD CONSTRAINT group_deal_requests_contact_required_check
      CHECK (
        COALESCE(TRIM(phone), '') <> ''
        OR COALESCE(TRIM(email), '') <> ''
      );
  `);

  await pool.query(`
    ALTER TABLE group_deal_requests
      DROP CONSTRAINT IF EXISTS group_deal_requests_consent_true_check;
  `);
  await pool.query(`
    ALTER TABLE group_deal_requests
      ADD CONSTRAINT group_deal_requests_consent_true_check
      CHECK (consent = TRUE);
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_group_deal_requests_updated_at ON group_deal_requests;');
  await pool.query(`
    CREATE TRIGGER trg_group_deal_requests_updated_at
    BEFORE UPDATE ON group_deal_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_requests_status_created_idx
      ON group_deal_requests (status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_requests_property_idx
      ON group_deal_requests (property_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_requests_created_deal_idx
      ON group_deal_requests (created_deal_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_requests_phone_idx
      ON group_deal_requests (normalized_phone, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS group_deal_requests_email_idx
      ON group_deal_requests (normalized_email, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS group_deal_requests_open_phone_unique_idx
      ON group_deal_requests (property_id, normalized_phone)
      WHERE normalized_phone <> ''
        AND status IN ('NEW', 'APPROVED');
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS group_deal_requests_open_email_unique_idx
      ON group_deal_requests (property_id, normalized_email)
      WHERE normalized_email <> ''
        AND status IN ('NEW', 'APPROVED');
  `);
}

export async function ensureBuildingMaterialsTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_vendors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      city VARCHAR(120) NOT NULL,
      state VARCHAR(120) NOT NULL,
      phone VARCHAR(40),
      is_verified BOOLEAN NOT NULL DEFAULT TRUE,
      rating NUMERIC(3, 2) NOT NULL DEFAULT 4.00,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_code VARCHAR(60) NOT NULL UNIQUE,
      vendor_id UUID NOT NULL REFERENCES material_vendors(id) ON DELETE CASCADE,
      item_name VARCHAR(200) NOT NULL,
      category VARCHAR(120) NOT NULL,
      brand VARCHAR(120) NOT NULL,
      unit VARCHAR(40) NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      min_order_qty INT NOT NULL DEFAULT 1,
      delivery_days INT NOT NULL DEFAULT 2,
      location_city VARCHAR(120) NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      bulk_slab_1 VARCHAR(120) NOT NULL DEFAULT '',
      bulk_slab_2 VARCHAR(120) NOT NULL DEFAULT '',
      stock_status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_vendors_rating_range_check'
      ) THEN
        ALTER TABLE material_vendors
          ADD CONSTRAINT material_vendors_rating_range_check
          CHECK (rating >= 0 AND rating <= 5);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_items_price_positive_check'
      ) THEN
        ALTER TABLE material_items
          ADD CONSTRAINT material_items_price_positive_check
          CHECK (unit_price > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_items_moq_positive_check'
      ) THEN
        ALTER TABLE material_items
          ADD CONSTRAINT material_items_moq_positive_check
          CHECK (min_order_qty > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_items_delivery_non_negative_check'
      ) THEN
        ALTER TABLE material_items
          ADD CONSTRAINT material_items_delivery_non_negative_check
          CHECK (delivery_days >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_items_stock_status_check'
      ) THEN
        ALTER TABLE material_items
          ADD CONSTRAINT material_items_stock_status_check
          CHECK (stock_status IN ('in_stock', 'limited', 'out_of_stock'));
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_items_category_city_idx
      ON material_items (category, location_city, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_items_vendor_idx
      ON material_items (vendor_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_items_name_idx
      ON material_items (item_name);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_reuse_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_code VARCHAR(40) NOT NULL UNIQUE,
      submitted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      seller_type VARCHAR(20) NOT NULL DEFAULT 'homeowner',
      material_category VARCHAR(120) NOT NULL,
      material_name VARCHAR(180) NOT NULL,
      approx_quantity VARCHAR(120) NOT NULL,
      materials JSONB NOT NULL DEFAULT '[]'::jsonb,
      location_city VARCHAR(120) NOT NULL,
      location_address VARCHAR(320) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      contact_name VARCHAR(120) NOT NULL DEFAULT '',
      contact_phone VARCHAR(40) NOT NULL DEFAULT '',
      consent_ownership BOOLEAN NOT NULL DEFAULT TRUE,
      consent_legal BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(40) NOT NULL DEFAULT 'submitted',
      admin_public_note VARCHAR(500) NOT NULL DEFAULT '',
      admin_internal_note VARCHAR(1000) NOT NULL DEFAULT '',
      valuation_inr NUMERIC(14, 2),
      picked_up_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_reuse_request_events (
      id BIGSERIAL PRIMARY KEY,
      request_id UUID NOT NULL REFERENCES material_reuse_requests(id) ON DELETE CASCADE,
      status VARCHAR(40) NOT NULL,
      note VARCHAR(500) NOT NULL DEFAULT '',
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_requests_seller_type_check'
      ) THEN
        ALTER TABLE material_reuse_requests
          ADD CONSTRAINT material_reuse_requests_seller_type_check
          CHECK (seller_type IN ('homeowner', 'builder', 'developer'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_requests_status_check'
      ) THEN
        ALTER TABLE material_reuse_requests
          ADD CONSTRAINT material_reuse_requests_status_check
          CHECK (
            status IN (
              'submitted',
              'under_review',
              'inspection_required',
              'inspection_not_required',
              'approved',
              'rejected',
              'picked_up',
              'closed'
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE material_reuse_requests
      ADD COLUMN IF NOT EXISTS materials JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    UPDATE material_reuse_requests
    SET materials = jsonb_build_array(
      jsonb_build_object(
        'materialCategory', material_category,
        'materialName', material_name,
        'approxQuantity', approx_quantity
      )
    )
    WHERE materials IS NULL
      OR jsonb_typeof(materials) <> 'array'
      OR jsonb_array_length(materials) = 0;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_requests_photo_urls_array_check'
      ) THEN
        ALTER TABLE material_reuse_requests
          ADD CONSTRAINT material_reuse_requests_photo_urls_array_check
          CHECK (jsonb_typeof(photo_urls) = 'array');
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_requests_materials_array_check'
      ) THEN
        ALTER TABLE material_reuse_requests
          ADD CONSTRAINT material_reuse_requests_materials_array_check
          CHECK (jsonb_typeof(materials) = 'array');
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_requests_valuation_non_negative_check'
      ) THEN
        ALTER TABLE material_reuse_requests
          ADD CONSTRAINT material_reuse_requests_valuation_non_negative_check
          CHECK (valuation_inr IS NULL OR valuation_inr >= 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'material_reuse_request_events_status_check'
      ) THEN
        ALTER TABLE material_reuse_request_events
          ADD CONSTRAINT material_reuse_request_events_status_check
          CHECK (
            status IN (
              'submitted',
              'under_review',
              'inspection_required',
              'inspection_not_required',
              'approved',
              'rejected',
              'picked_up',
              'closed'
            )
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_reuse_requests_user_created_idx
      ON material_reuse_requests (submitted_by_user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_reuse_requests_status_created_idx
      ON material_reuse_requests (status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_reuse_requests_city_status_idx
      ON material_reuse_requests (location_city, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS material_reuse_request_events_request_created_idx
      ON material_reuse_request_events (request_id, created_at ASC);
  `);

  const vendorSeeds = [
    {
      vendorCode: 'VND-URBAN-CEMENT',
      name: 'Urban Cement Depot',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '+91-98900-11001',
      isVerified: true,
      rating: 4.6,
    },
    {
      vendorCode: 'VND-METRO-STEEL',
      name: 'Metro Steel House',
      city: 'Mumbai',
      state: 'Maharashtra',
      phone: '+91-98900-22002',
      isVerified: true,
      rating: 4.5,
    },
    {
      vendorCode: 'VND-TILE-CRAFT',
      name: 'Tile Craft Gallery',
      city: 'Bengaluru',
      state: 'Karnataka',
      phone: '+91-98900-33003',
      isVerified: true,
      rating: 4.4,
    },
    {
      vendorCode: 'VND-ELECTRO-PLUS',
      name: 'Electro Plus Infra',
      city: 'Hyderabad',
      state: 'Telangana',
      phone: '+91-98900-44004',
      isVerified: true,
      rating: 4.3,
    },
    {
      vendorCode: 'VND-PLUMB-PRO',
      name: 'Plumb Pro Supplies',
      city: 'Chennai',
      state: 'Tamil Nadu',
      phone: '+91-98900-55005',
      isVerified: true,
      rating: 4.2,
    },
    {
      vendorCode: 'VND-INTERIOR-HUB',
      name: 'Interior Hub Works',
      city: 'Ahmedabad',
      state: 'Gujarat',
      phone: '+91-98900-66006',
      isVerified: true,
      rating: 4.4,
    },
  ];

  for (const vendor of vendorSeeds) {
    await pool.query(
      `
        INSERT INTO material_vendors (
          vendor_code,
          name,
          city,
          state,
          phone,
          is_verified,
          rating
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (vendor_code)
        DO UPDATE SET
          name = EXCLUDED.name,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          phone = EXCLUDED.phone,
          is_verified = EXCLUDED.is_verified,
          rating = EXCLUDED.rating
      `,
      [
        vendor.vendorCode,
        vendor.name,
        vendor.city,
        vendor.state,
        vendor.phone,
        vendor.isVerified,
        vendor.rating,
      ]
    );
  }

  const itemSeeds = [
    {
      itemCode: 'MAT-CEM-OPC53',
      vendorCode: 'VND-URBAN-CEMENT',
      itemName: 'OPC 53 Grade Cement',
      category: 'Cement',
      brand: 'UltraTech',
      unit: '50kg bag',
      unitPrice: 392,
      minOrderQty: 100,
      deliveryDays: 1,
      locationCity: 'Pune',
      imageUrl: '',
      description: 'High-strength cement for structural slabs, columns and beams.',
      bulkSlab1: '500+ bags: INR 382',
      bulkSlab2: '1000+ bags: INR 376',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-CEM-PPC',
      vendorCode: 'VND-URBAN-CEMENT',
      itemName: 'PPC Cement',
      category: 'Cement',
      brand: 'ACC',
      unit: '50kg bag',
      unitPrice: 365,
      minOrderQty: 120,
      deliveryDays: 1,
      locationCity: 'Pune',
      imageUrl: '',
      description: 'Low-heat blended cement suitable for plastering and masonry.',
      bulkSlab1: '500+ bags: INR 358',
      bulkSlab2: '1200+ bags: INR 352',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-STEEL-TMT12',
      vendorCode: 'VND-METRO-STEEL',
      itemName: 'TMT Steel Bar Fe500D 12mm',
      category: 'Steel',
      brand: 'Tata Tiscon',
      unit: 'per ton',
      unitPrice: 62800,
      minOrderQty: 5,
      deliveryDays: 2,
      locationCity: 'Mumbai',
      imageUrl: '',
      description: 'Earthquake-resistant rebars for high-rise and commercial structures.',
      bulkSlab1: '20+ tons: INR 62150',
      bulkSlab2: '50+ tons: INR 61700',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-STEEL-ANGLE',
      vendorCode: 'VND-METRO-STEEL',
      itemName: 'Structural Steel Angle 6m',
      category: 'Steel',
      brand: 'JSW',
      unit: 'per ton',
      unitPrice: 65400,
      minOrderQty: 3,
      deliveryDays: 3,
      locationCity: 'Mumbai',
      imageUrl: '',
      description: 'Fabrication grade structural sections for frames and supports.',
      bulkSlab1: '15+ tons: INR 64800',
      bulkSlab2: '40+ tons: INR 64200',
      stockStatus: 'limited',
    },
    {
      itemCode: 'MAT-BLOCK-AAC',
      vendorCode: 'VND-URBAN-CEMENT',
      itemName: 'AAC Blocks 600x200x200',
      category: 'Bricks and Blocks',
      brand: 'Magicrete',
      unit: 'per block',
      unitPrice: 74,
      minOrderQty: 500,
      deliveryDays: 2,
      locationCity: 'Pune',
      imageUrl: '',
      description: 'Lightweight thermal-insulation blocks for faster wall construction.',
      bulkSlab1: '2000+ blocks: INR 71',
      bulkSlab2: '5000+ blocks: INR 68',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-SAND-RIVER',
      vendorCode: 'VND-URBAN-CEMENT',
      itemName: 'River Sand Premium',
      category: 'Sand and Aggregates',
      brand: 'SiteGrade',
      unit: 'per brass',
      unitPrice: 6700,
      minOrderQty: 2,
      deliveryDays: 1,
      locationCity: 'Pune',
      imageUrl: '',
      description: 'Washed river sand for RCC and plastering work.',
      bulkSlab1: '10+ brass: INR 6550',
      bulkSlab2: '25+ brass: INR 6425',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-TILE-VITRIFIED',
      vendorCode: 'VND-TILE-CRAFT',
      itemName: 'Vitrified Tile 600x600',
      category: 'Tiles and Flooring',
      brand: 'Kajaria',
      unit: 'per sqft',
      unitPrice: 82,
      minOrderQty: 1200,
      deliveryDays: 4,
      locationCity: 'Bengaluru',
      imageUrl: '',
      description: 'Double-charge vitrified floor tile for apartments and offices.',
      bulkSlab1: '5000+ sqft: INR 79',
      bulkSlab2: '12000+ sqft: INR 76',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-TILE-WALL',
      vendorCode: 'VND-TILE-CRAFT',
      itemName: 'Ceramic Wall Tile 300x450',
      category: 'Tiles and Flooring',
      brand: 'Somany',
      unit: 'per sqft',
      unitPrice: 56,
      minOrderQty: 1500,
      deliveryDays: 4,
      locationCity: 'Bengaluru',
      imageUrl: '',
      description: 'Wall tiles for kitchens, washrooms and commercial common areas.',
      bulkSlab1: '6000+ sqft: INR 53',
      bulkSlab2: '15000+ sqft: INR 50',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-ELEC-WIRE',
      vendorCode: 'VND-ELECTRO-PLUS',
      itemName: 'Copper Electrical Wire 1.5 sqmm',
      category: 'Electrical',
      brand: 'Polycab',
      unit: '90m coil',
      unitPrice: 2540,
      minOrderQty: 40,
      deliveryDays: 2,
      locationCity: 'Hyderabad',
      imageUrl: '',
      description: 'Fire-retardant low-smoke wiring for residential towers.',
      bulkSlab1: '150+ coils: INR 2480',
      bulkSlab2: '300+ coils: INR 2435',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-ELEC-MCB',
      vendorCode: 'VND-ELECTRO-PLUS',
      itemName: 'SP MCB 16A',
      category: 'Electrical',
      brand: 'Schneider',
      unit: 'per piece',
      unitPrice: 192,
      minOrderQty: 200,
      deliveryDays: 2,
      locationCity: 'Hyderabad',
      imageUrl: '',
      description: 'Reliable circuit protection for floor-wise distribution boards.',
      bulkSlab1: '1000+ pcs: INR 186',
      bulkSlab2: '3000+ pcs: INR 179',
      stockStatus: 'limited',
    },
    {
      itemCode: 'MAT-PLUMB-CPVC20',
      vendorCode: 'VND-PLUMB-PRO',
      itemName: 'CPVC Plumbing Pipe 20mm',
      category: 'Plumbing',
      brand: 'Astral',
      unit: '3m length',
      unitPrice: 118,
      minOrderQty: 300,
      deliveryDays: 3,
      locationCity: 'Chennai',
      imageUrl: '',
      description: 'Hot and cold water pipe suitable for apartment riser lines.',
      bulkSlab1: '1200+ lengths: INR 112',
      bulkSlab2: '3000+ lengths: INR 108',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-PLUMB-UPVC110',
      vendorCode: 'VND-PLUMB-PRO',
      itemName: 'UPVC SWR Pipe 110mm',
      category: 'Plumbing',
      brand: 'Supreme',
      unit: '3m length',
      unitPrice: 498,
      minOrderQty: 120,
      deliveryDays: 3,
      locationCity: 'Chennai',
      imageUrl: '',
      description: 'Drainage stack piping with high impact and chemical resistance.',
      bulkSlab1: '500+ lengths: INR 476',
      bulkSlab2: '1200+ lengths: INR 463',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-PAINT-PRIMER',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Acrylic Wall Primer',
      category: 'Paint and Coatings',
      brand: 'Asian Paints',
      unit: '20L drum',
      unitPrice: 3280,
      minOrderQty: 25,
      deliveryDays: 2,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Interior primer coat for smooth and durable paint finish.',
      bulkSlab1: '100+ drums: INR 3180',
      bulkSlab2: '250+ drums: INR 3090',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-PAINT-EXTERIOR',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Exterior Weather Proof Paint',
      category: 'Paint and Coatings',
      brand: 'Berger',
      unit: '20L drum',
      unitPrice: 5640,
      minOrderQty: 20,
      deliveryDays: 2,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Exterior coating with UV and water resistance for facades.',
      bulkSlab1: '80+ drums: INR 5480',
      bulkSlab2: '200+ drums: INR 5360',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-INTERIOR-KITCHEN',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Modular Kitchen Base Unit',
      category: 'Interior Fit-out',
      brand: 'Spacewood',
      unit: 'per running ft',
      unitPrice: 3550,
      minOrderQty: 80,
      deliveryDays: 7,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Factory-finished base cabinets for apartment interior handover.',
      bulkSlab1: '300+ rft: INR 3410',
      bulkSlab2: '700+ rft: INR 3320',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-INTERIOR-GYPSUM',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Gypsum Ceiling Board 12mm',
      category: 'Interior Fit-out',
      brand: 'Saint-Gobain',
      unit: '8x4 sheet',
      unitPrice: 378,
      minOrderQty: 200,
      deliveryDays: 5,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'False-ceiling board for residential towers and office floors.',
      bulkSlab1: '800+ sheets: INR 365',
      bulkSlab2: '2000+ sheets: INR 352',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-INTERIOR-WARDROBE',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Modular Wardrobe Unit',
      category: 'Interior Fit-out',
      brand: 'Godrej Interio',
      unit: 'per running ft',
      unitPrice: 2890,
      minOrderQty: 80,
      deliveryDays: 7,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Pre-laminated wardrobe modules for apartment bedroom handover.',
      bulkSlab1: '300+ rft: INR 2790',
      bulkSlab2: '700+ rft: INR 2710',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-INTERIOR-TVUNIT',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Living Room TV Console Unit',
      category: 'Interior Fit-out',
      brand: 'Greenply',
      unit: 'per running ft',
      unitPrice: 2180,
      minOrderQty: 100,
      deliveryDays: 6,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Wall-mounted console system for living room interior fit-out.',
      bulkSlab1: '350+ rft: INR 2095',
      bulkSlab2: '800+ rft: INR 2025',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-INTERIOR-BATHVANITY',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'Bathroom Vanity Counter Set',
      category: 'Interior Fit-out',
      brand: 'Jaquar',
      unit: 'per set',
      unitPrice: 11250,
      minOrderQty: 40,
      deliveryDays: 8,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Vanity counter with basin and mirror cabinet for premium units.',
      bulkSlab1: '120+ sets: INR 10840',
      bulkSlab2: '280+ sets: INR 10490',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-RMC-M25',
      vendorCode: 'VND-URBAN-CEMENT',
      itemName: 'Ready Mix Concrete M25',
      category: 'Concrete',
      brand: 'RMC India',
      unit: 'per cubic meter',
      unitPrice: 6180,
      minOrderQty: 25,
      deliveryDays: 1,
      locationCity: 'Pune',
      imageUrl: '',
      description: 'Pump grade RMC for slab and raft pours with quality assurance.',
      bulkSlab1: '100+ cum: INR 6040',
      bulkSlab2: '250+ cum: INR 5960',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-WATERPROOF-ADMIX',
      vendorCode: 'VND-PLUMB-PRO',
      itemName: 'Waterproofing Admixture',
      category: 'Chemicals',
      brand: 'Dr Fixit',
      unit: '20L can',
      unitPrice: 2240,
      minOrderQty: 30,
      deliveryDays: 3,
      locationCity: 'Chennai',
      imageUrl: '',
      description: 'Integral waterproofing compound for RCC and plaster works.',
      bulkSlab1: '120+ cans: INR 2165',
      bulkSlab2: '300+ cans: INR 2090',
      stockStatus: 'in_stock',
    },
    {
      itemCode: 'MAT-WINDOW-UPVC',
      vendorCode: 'VND-INTERIOR-HUB',
      itemName: 'UPVC Sliding Window Set',
      category: 'Doors and Windows',
      brand: 'Fenesta',
      unit: 'per sqft',
      unitPrice: 690,
      minOrderQty: 500,
      deliveryDays: 9,
      locationCity: 'Ahmedabad',
      imageUrl: '',
      description: 'Factory-made UPVC windows with mosquito mesh and hardware.',
      bulkSlab1: '2500+ sqft: INR 668',
      bulkSlab2: '6000+ sqft: INR 651',
      stockStatus: 'limited',
    },
  ];

  const legacySeedImages = [
    '/images/service-materials.jpg',
    '/images/property-1.jpg',
    '/images/property-2.jpg',
    '/images/property-3.jpg',
    '/images/property-4.jpg',
    '/images/property-5.jpg',
    '/images/service-analytics.jpg',
    '/images/service-news.jpg',
    '/images/service-location.jpg',
    '/images/service-subscription.jpg',
  ];

  await pool.query(
    `
      UPDATE material_items
      SET image_url = ''
      WHERE image_url = ANY($1::TEXT[])
    `,
    [legacySeedImages]
  );

  for (const item of itemSeeds) {
    await pool.query(
      `
        INSERT INTO material_items (
          item_code,
          vendor_id,
          item_name,
          category,
          brand,
          unit,
          unit_price,
          min_order_qty,
          delivery_days,
          location_city,
          image_url,
          description,
          bulk_slab_1,
          bulk_slab_2,
          stock_status
        )
        SELECT
          $1,
          v.id,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15
        FROM material_vendors v
        WHERE v.vendor_code = $2
        ON CONFLICT (item_code)
        DO UPDATE SET
          vendor_id = EXCLUDED.vendor_id,
          item_name = EXCLUDED.item_name,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          min_order_qty = EXCLUDED.min_order_qty,
          delivery_days = EXCLUDED.delivery_days,
          location_city = EXCLUDED.location_city,
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), material_items.image_url),
          description = EXCLUDED.description,
          bulk_slab_1 = EXCLUDED.bulk_slab_1,
          bulk_slab_2 = EXCLUDED.bulk_slab_2,
          stock_status = EXCLUDED.stock_status
      `,
      [
        item.itemCode,
        item.vendorCode,
        item.itemName,
        item.category,
        item.brand,
        item.unit,
        item.unitPrice,
        item.minOrderQty,
        item.deliveryDays,
        item.locationCity,
        item.imageUrl,
        item.description,
        item.bulkSlab1,
        item.bulkSlab2,
        item.stockStatus,
      ]
    );
  }
}

export async function ensureSitePromotionsTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query('DROP TRIGGER IF EXISTS trg_site_promotions_updated_at ON site_promotions;');
  await pool.query(`
    CREATE TRIGGER trg_site_promotions_updated_at
    BEFORE UPDATE ON site_promotions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_promotions_public_idx
      ON site_promotions (is_active, promo_type, sort_order, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_promotions_window_idx
      ON site_promotions (start_at, end_at);
  `);
}

export async function ensureSupportProgramTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_contributions (
      id BIGSERIAL PRIMARY KEY,
      supporter_name VARCHAR(120) NOT NULL DEFAULT '',
      amount_inr INT NOT NULL,
      reported_amount_inr INT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      upi_reference VARCHAR(80) NOT NULL,
      consent_to_record BOOLEAN NOT NULL DEFAULT TRUE,
      consent_to_acknowledge BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_ip VARCHAR(64) NOT NULL DEFAULT '',
      verification_status VARCHAR(16) NOT NULL DEFAULT 'Pending',
      verification_note TEXT NOT NULL DEFAULT '',
      admin_reply_message TEXT NOT NULL DEFAULT '',
      verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE support_contributions
      ADD COLUMN IF NOT EXISTS reported_amount_inr INT NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16) NOT NULL DEFAULT 'Pending',
      ADD COLUMN IF NOT EXISTS verification_note TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS admin_reply_message TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_amount_inr_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_amount_inr_check
          CHECK (amount_inr >= 10);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_reported_amount_inr_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_reported_amount_inr_check
          CHECK (reported_amount_inr >= 10);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_upi_reference_length_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_upi_reference_length_check
          CHECK (char_length(trim(upi_reference)) >= 6);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_verification_status_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_verification_status_check
          CHECK (verification_status IN ('Pending', 'Verified', 'Rejected'));
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_verification_note_length_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_verification_note_length_check
          CHECK (char_length(verification_note) <= 500);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_contributions_admin_reply_message_length_check'
      ) THEN
        ALTER TABLE support_contributions
          ADD CONSTRAINT support_contributions_admin_reply_message_length_check
          CHECK (char_length(admin_reply_message) <= 500);
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE support_contributions
    SET reported_amount_inr = amount_inr
    WHERE reported_amount_inr IS NULL
       OR reported_amount_inr < 10;
  `);

  await pool.query(`
    UPDATE support_contributions
    SET verification_status = 'Pending'
    WHERE verification_status IS NULL
      OR verification_status NOT IN ('Pending', 'Verified', 'Rejected');
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS support_contributions_upi_reference_unique_idx
      ON support_contributions ((lower(trim(upi_reference))));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS support_contributions_created_at_idx
      ON support_contributions (created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS support_contributions_verification_status_idx
      ON support_contributions (verification_status, created_at DESC);
  `);
}

export async function ensureCollaborationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaboration_inquiries (
      id BIGSERIAL PRIMARY KEY,
      business_name VARCHAR(160) NOT NULL,
      contact_name VARCHAR(120) NOT NULL DEFAULT '',
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(32) NOT NULL DEFAULT '',
      collaboration_type VARCHAR(40) NOT NULL
        CHECK (collaboration_type IN (
          'sponsored_property', 'brand_partnership',
          'content_promotion', 'event_sponsorship', 'custom'
        )),
      package_tier VARCHAR(20) NOT NULL DEFAULT 'custom'
        CHECK (package_tier IN ('bronze', 'silver', 'gold', 'platinum', 'custom')),
      budget_range VARCHAR(60) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'contacted', 'negotiating', 'active', 'completed', 'declined')),
      admin_notes TEXT NOT NULL DEFAULT '',
      reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      submission_ip VARCHAR(64) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS collab_inquiries_status_idx
      ON collaboration_inquiries (status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS collab_inquiries_email_idx
      ON collaboration_inquiries ((lower(trim(email))));
  `);
}

pool
  .connect()
  .then((client) => {
    console.log('Connected to PostgreSQL database');
    client.release();
  })
  .catch((err) => {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  });

export default pool;

