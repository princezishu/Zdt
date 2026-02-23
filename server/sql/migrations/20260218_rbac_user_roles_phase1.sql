BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  role_key VARCHAR(20) PRIMARY KEY,
  title VARCHAR(60) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  uuid_id UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_key VARCHAR(80) PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  module_name VARCHAR(40) NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  uuid_id UUID NOT NULL DEFAULT gen_random_uuid()
);

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

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'role_permissions_role_check'
  ) THEN
    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_role_check
      CHECK (role IN ('user', 'team_member', 'admin', 'main_admin'));
  END IF;
END $$;

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

UPDATE roles SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE permissions SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE role_permissions SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

ALTER TABLE roles ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE permissions ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE role_permissions ALTER COLUMN uuid_id SET NOT NULL;

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

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(24) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_uuid_id_unique ON roles(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_uuid_id_unique ON permissions(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_uuid_id_unique ON role_permissions(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role_active_unique
  ON user_roles(user_id, role_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON user_roles(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON user_roles(role_key, deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by ON user_roles(assigned_by_user_id, created_at DESC);

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

DROP TRIGGER IF EXISTS trg_users_sync_user_roles ON users;
CREATE TRIGGER trg_users_sync_user_roles
AFTER INSERT OR UPDATE OF role, is_main_admin ON users
FOR EACH ROW
EXECUTE FUNCTION sync_user_roles_from_users();

UPDATE user_roles
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE assignment_source = 'legacy_bridge'
  AND deleted_at IS NULL;

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
  assignment_source = 'legacy_bridge';

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
  assignment_source = 'legacy_bridge';

UPDATE user_roles ur
SET deleted_at = NOW(),
    updated_at = NOW()
FROM users u
WHERE ur.user_id = u.id
  AND ur.assignment_source = 'legacy_bridge'
  AND ur.role_key = 'main_admin'
  AND ur.deleted_at IS NULL
  AND u.is_main_admin = FALSE;

COMMIT;
