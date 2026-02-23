-- Phase 3 UUID Cutover (Backfill + Bridge Triggers)
-- Run after 20260218_uuid_phase3_expand_core.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Backfill row UUID ids.
UPDATE users SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE password_reset_otps SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE user_sessions SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE user_profiles SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE main_admin_profile_media SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE property_requests SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE property_request_status_history SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE career_applications SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE career_application_status_history SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE activity_logs SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE audit_logs SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE subscriptions SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE listing_analytics_events SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE property_price_history SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE property_analytics_daily SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE user_analytics SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE lead_analytics SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE user_favorite_listings SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE chat_conversations SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
UPDATE chat_messages SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

-- 2) Backfill UUID foreign bridge columns.
UPDATE password_reset_otps t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE user_sessions t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE user_sessions t
SET revoked_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.revoked_by_user_id = u.id
  AND (t.revoked_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE user_profiles t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE main_admin_profile_media t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_requests t
SET submitted_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.submitted_by_user_id = u.id
  AND (t.submitted_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_requests t
SET assigned_to_user_uuid_id = u.uuid_id
FROM users u
WHERE t.assigned_to_user_id = u.id
  AND (t.assigned_to_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_requests t
SET created_by_team_member_uuid_id = u.uuid_id
FROM users u
WHERE t.created_by_team_member_id = u.id
  AND (t.created_by_team_member_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_requests t
SET assigned_by_admin_uuid_id = u.uuid_id
FROM users u
WHERE t.assigned_by_admin_id = u.id
  AND (t.assigned_by_admin_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_request_status_history t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE property_request_status_history t
SET changed_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.changed_by_user_id = u.id
  AND (t.changed_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE career_applications t
SET reviewed_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.reviewed_by_user_id = u.id
  AND (t.reviewed_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE career_applications t
SET created_account_user_uuid_id = u.uuid_id
FROM users u
WHERE t.created_account_user_id = u.id
  AND (t.created_account_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE career_application_status_history t
SET career_application_uuid_id = c.uuid_id
FROM career_applications c
WHERE t.career_application_id = c.id
  AND (t.career_application_uuid_id IS DISTINCT FROM c.uuid_id);

UPDATE career_application_status_history t
SET changed_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.changed_by_user_id = u.id
  AND (t.changed_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE activity_logs t
SET actor_user_uuid_id = u.uuid_id
FROM users u
WHERE t.actor_user_id = u.id
  AND (t.actor_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE audit_logs t
SET actor_uuid_id = u.uuid_id
FROM users u
WHERE t.actor_id = u.id
  AND (t.actor_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE subscriptions t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE listing_analytics_events t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE listing_analytics_events t
SET actor_user_uuid_id = u.uuid_id
FROM users u
WHERE t.actor_user_id = u.id
  AND (t.actor_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_price_history t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE property_price_history t
SET changed_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.changed_by_user_id = u.id
  AND (t.changed_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE property_analytics_daily t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE user_analytics t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE lead_analytics t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE user_favorite_listings t
SET user_uuid_id = u.uuid_id
FROM users u
WHERE t.user_id = u.id
  AND (t.user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE user_favorite_listings t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE chat_conversations t
SET requester_user_uuid_id = u.uuid_id
FROM users u
WHERE t.requester_user_id = u.id
  AND (t.requester_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE chat_conversations t
SET owner_user_uuid_id = u.uuid_id
FROM users u
WHERE t.owner_user_id = u.id
  AND (t.owner_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE chat_conversations t
SET property_request_uuid_id = p.uuid_id
FROM property_requests p
WHERE t.property_request_id = p.id
  AND (t.property_request_uuid_id IS DISTINCT FROM p.uuid_id);

UPDATE chat_conversations t
SET created_by_user_uuid_id = u.uuid_id
FROM users u
WHERE t.created_by_user_id = u.id
  AND (t.created_by_user_uuid_id IS DISTINCT FROM u.uuid_id);

UPDATE chat_messages t
SET conversation_uuid_id = c.uuid_id
FROM chat_conversations c
WHERE t.conversation_id = c.id
  AND (t.conversation_uuid_id IS DISTINCT FROM c.uuid_id);

UPDATE chat_messages t
SET sender_user_uuid_id = u.uuid_id
FROM users u
WHERE t.sender_user_id = u.id
  AND (t.sender_user_uuid_id IS DISTINCT FROM u.uuid_id);

-- 3) Helper lookup functions.
CREATE OR REPLACE FUNCTION lookup_user_uuid(p_id BIGINT)
RETURNS UUID AS $$
  SELECT uuid_id FROM users WHERE id = p_id
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_user_id(p_uuid UUID)
RETURNS BIGINT AS $$
  SELECT id FROM users WHERE uuid_id = p_uuid
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_property_request_uuid(p_id BIGINT)
RETURNS UUID AS $$
  SELECT uuid_id FROM property_requests WHERE id = p_id
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_property_request_id(p_uuid UUID)
RETURNS BIGINT AS $$
  SELECT id FROM property_requests WHERE uuid_id = p_uuid
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_chat_conversation_uuid(p_id BIGINT)
RETURNS UUID AS $$
  SELECT uuid_id FROM chat_conversations WHERE id = p_id
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_chat_conversation_id(p_uuid UUID)
RETURNS BIGINT AS $$
  SELECT id FROM chat_conversations WHERE uuid_id = p_uuid
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_career_application_uuid(p_id BIGINT)
RETURNS UUID AS $$
  SELECT uuid_id FROM career_applications WHERE id = p_id
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION lookup_career_application_id(p_uuid UUID)
RETURNS BIGINT AS $$
  SELECT id FROM career_applications WHERE uuid_id = p_uuid
$$ LANGUAGE SQL STABLE;

-- 4) Bridge trigger functions.
CREATE OR REPLACE FUNCTION bridge_user_sessions_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_uuid_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.user_uuid_id := lookup_user_uuid(NEW.user_id);
  END IF;
  IF NEW.user_id IS NULL AND NEW.user_uuid_id IS NOT NULL THEN
    NEW.user_id := lookup_user_id(NEW.user_uuid_id);
  END IF;

  IF NEW.revoked_by_user_uuid_id IS NULL AND NEW.revoked_by_user_id IS NOT NULL THEN
    NEW.revoked_by_user_uuid_id := lookup_user_uuid(NEW.revoked_by_user_id);
  END IF;
  IF NEW.revoked_by_user_id IS NULL AND NEW.revoked_by_user_uuid_id IS NOT NULL THEN
    NEW.revoked_by_user_id := lookup_user_id(NEW.revoked_by_user_uuid_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_property_requests_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.submitted_by_user_uuid_id IS NULL AND NEW.submitted_by_user_id IS NOT NULL THEN
    NEW.submitted_by_user_uuid_id := lookup_user_uuid(NEW.submitted_by_user_id);
  END IF;
  IF NEW.submitted_by_user_id IS NULL AND NEW.submitted_by_user_uuid_id IS NOT NULL THEN
    NEW.submitted_by_user_id := lookup_user_id(NEW.submitted_by_user_uuid_id);
  END IF;

  IF NEW.assigned_to_user_uuid_id IS NULL AND NEW.assigned_to_user_id IS NOT NULL THEN
    NEW.assigned_to_user_uuid_id := lookup_user_uuid(NEW.assigned_to_user_id);
  END IF;
  IF NEW.assigned_to_user_id IS NULL AND NEW.assigned_to_user_uuid_id IS NOT NULL THEN
    NEW.assigned_to_user_id := lookup_user_id(NEW.assigned_to_user_uuid_id);
  END IF;

  IF NEW.created_by_team_member_uuid_id IS NULL AND NEW.created_by_team_member_id IS NOT NULL THEN
    NEW.created_by_team_member_uuid_id := lookup_user_uuid(NEW.created_by_team_member_id);
  END IF;
  IF NEW.created_by_team_member_id IS NULL AND NEW.created_by_team_member_uuid_id IS NOT NULL THEN
    NEW.created_by_team_member_id := lookup_user_id(NEW.created_by_team_member_uuid_id);
  END IF;

  IF NEW.assigned_by_admin_uuid_id IS NULL AND NEW.assigned_by_admin_id IS NOT NULL THEN
    NEW.assigned_by_admin_uuid_id := lookup_user_uuid(NEW.assigned_by_admin_id);
  END IF;
  IF NEW.assigned_by_admin_id IS NULL AND NEW.assigned_by_admin_uuid_id IS NOT NULL THEN
    NEW.assigned_by_admin_id := lookup_user_id(NEW.assigned_by_admin_uuid_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_property_request_status_history_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_request_uuid_id IS NULL AND NEW.property_request_id IS NOT NULL THEN
    NEW.property_request_uuid_id := lookup_property_request_uuid(NEW.property_request_id);
  END IF;
  IF NEW.property_request_id IS NULL AND NEW.property_request_uuid_id IS NOT NULL THEN
    NEW.property_request_id := lookup_property_request_id(NEW.property_request_uuid_id);
  END IF;

  IF NEW.changed_by_user_uuid_id IS NULL AND NEW.changed_by_user_id IS NOT NULL THEN
    NEW.changed_by_user_uuid_id := lookup_user_uuid(NEW.changed_by_user_id);
  END IF;
  IF NEW.changed_by_user_id IS NULL AND NEW.changed_by_user_uuid_id IS NOT NULL THEN
    NEW.changed_by_user_id := lookup_user_id(NEW.changed_by_user_uuid_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_subscriptions_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_uuid_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.user_uuid_id := lookup_user_uuid(NEW.user_id);
  END IF;
  IF NEW.user_id IS NULL AND NEW.user_uuid_id IS NOT NULL THEN
    NEW.user_id := lookup_user_id(NEW.user_uuid_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_listing_analytics_events_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_request_uuid_id IS NULL AND NEW.property_request_id IS NOT NULL THEN
    NEW.property_request_uuid_id := lookup_property_request_uuid(NEW.property_request_id);
  END IF;
  IF NEW.property_request_id IS NULL AND NEW.property_request_uuid_id IS NOT NULL THEN
    NEW.property_request_id := lookup_property_request_id(NEW.property_request_uuid_id);
  END IF;

  IF NEW.actor_user_uuid_id IS NULL AND NEW.actor_user_id IS NOT NULL THEN
    NEW.actor_user_uuid_id := lookup_user_uuid(NEW.actor_user_id);
  END IF;
  IF NEW.actor_user_id IS NULL AND NEW.actor_user_uuid_id IS NOT NULL THEN
    NEW.actor_user_id := lookup_user_id(NEW.actor_user_uuid_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_chat_conversations_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requester_user_uuid_id IS NULL AND NEW.requester_user_id IS NOT NULL THEN
    NEW.requester_user_uuid_id := lookup_user_uuid(NEW.requester_user_id);
  END IF;
  IF NEW.requester_user_id IS NULL AND NEW.requester_user_uuid_id IS NOT NULL THEN
    NEW.requester_user_id := lookup_user_id(NEW.requester_user_uuid_id);
  END IF;

  IF NEW.owner_user_uuid_id IS NULL AND NEW.owner_user_id IS NOT NULL THEN
    NEW.owner_user_uuid_id := lookup_user_uuid(NEW.owner_user_id);
  END IF;
  IF NEW.owner_user_id IS NULL AND NEW.owner_user_uuid_id IS NOT NULL THEN
    NEW.owner_user_id := lookup_user_id(NEW.owner_user_uuid_id);
  END IF;

  IF NEW.property_request_uuid_id IS NULL AND NEW.property_request_id IS NOT NULL THEN
    NEW.property_request_uuid_id := lookup_property_request_uuid(NEW.property_request_id);
  END IF;
  IF NEW.property_request_id IS NULL AND NEW.property_request_uuid_id IS NOT NULL THEN
    NEW.property_request_id := lookup_property_request_id(NEW.property_request_uuid_id);
  END IF;

  IF NEW.created_by_user_uuid_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
    NEW.created_by_user_uuid_id := lookup_user_uuid(NEW.created_by_user_id);
  END IF;
  IF NEW.created_by_user_id IS NULL AND NEW.created_by_user_uuid_id IS NOT NULL THEN
    NEW.created_by_user_id := lookup_user_id(NEW.created_by_user_uuid_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bridge_chat_messages_uuid_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.conversation_uuid_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    NEW.conversation_uuid_id := lookup_chat_conversation_uuid(NEW.conversation_id);
  END IF;
  IF NEW.conversation_id IS NULL AND NEW.conversation_uuid_id IS NOT NULL THEN
    NEW.conversation_id := lookup_chat_conversation_id(NEW.conversation_uuid_id);
  END IF;

  IF NEW.sender_user_uuid_id IS NULL AND NEW.sender_user_id IS NOT NULL THEN
    NEW.sender_user_uuid_id := lookup_user_uuid(NEW.sender_user_id);
  END IF;
  IF NEW.sender_user_id IS NULL AND NEW.sender_user_uuid_id IS NOT NULL THEN
    NEW.sender_user_id := lookup_user_id(NEW.sender_user_uuid_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Attach bridge triggers.
DROP TRIGGER IF EXISTS trg_user_sessions_uuid_bridge ON user_sessions;
CREATE TRIGGER trg_user_sessions_uuid_bridge
BEFORE INSERT OR UPDATE ON user_sessions
FOR EACH ROW EXECUTE FUNCTION bridge_user_sessions_uuid_ids();

DROP TRIGGER IF EXISTS trg_property_requests_uuid_bridge ON property_requests;
CREATE TRIGGER trg_property_requests_uuid_bridge
BEFORE INSERT OR UPDATE ON property_requests
FOR EACH ROW EXECUTE FUNCTION bridge_property_requests_uuid_ids();

DROP TRIGGER IF EXISTS trg_property_request_status_history_uuid_bridge ON property_request_status_history;
CREATE TRIGGER trg_property_request_status_history_uuid_bridge
BEFORE INSERT OR UPDATE ON property_request_status_history
FOR EACH ROW EXECUTE FUNCTION bridge_property_request_status_history_uuid_ids();

DROP TRIGGER IF EXISTS trg_subscriptions_uuid_bridge ON subscriptions;
CREATE TRIGGER trg_subscriptions_uuid_bridge
BEFORE INSERT OR UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION bridge_subscriptions_uuid_ids();

DROP TRIGGER IF EXISTS trg_listing_analytics_events_uuid_bridge ON listing_analytics_events;
CREATE TRIGGER trg_listing_analytics_events_uuid_bridge
BEFORE INSERT OR UPDATE ON listing_analytics_events
FOR EACH ROW EXECUTE FUNCTION bridge_listing_analytics_events_uuid_ids();

DROP TRIGGER IF EXISTS trg_chat_conversations_uuid_bridge ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_uuid_bridge
BEFORE INSERT OR UPDATE ON chat_conversations
FOR EACH ROW EXECUTE FUNCTION bridge_chat_conversations_uuid_ids();

DROP TRIGGER IF EXISTS trg_chat_messages_uuid_bridge ON chat_messages;
CREATE TRIGGER trg_chat_messages_uuid_bridge
BEFORE INSERT OR UPDATE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION bridge_chat_messages_uuid_ids();

-- 6) Add UUID foreign-key constraints in NOT VALID mode, then validate.
ALTER TABLE password_reset_otps DROP CONSTRAINT IF EXISTS password_reset_otps_user_uuid_fkey;
ALTER TABLE password_reset_otps
  ADD CONSTRAINT password_reset_otps_user_uuid_fkey
  FOREIGN KEY (user_uuid_id) REFERENCES users(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE password_reset_otps VALIDATE CONSTRAINT password_reset_otps_user_uuid_fkey;

ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_uuid_fkey;
ALTER TABLE user_sessions
  ADD CONSTRAINT user_sessions_user_uuid_fkey
  FOREIGN KEY (user_uuid_id) REFERENCES users(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_sessions VALIDATE CONSTRAINT user_sessions_user_uuid_fkey;

ALTER TABLE property_requests DROP CONSTRAINT IF EXISTS property_requests_submitted_by_user_uuid_fkey;
ALTER TABLE property_requests
  ADD CONSTRAINT property_requests_submitted_by_user_uuid_fkey
  FOREIGN KEY (submitted_by_user_uuid_id) REFERENCES users(uuid_id) ON DELETE SET NULL NOT VALID;
ALTER TABLE property_requests VALIDATE CONSTRAINT property_requests_submitted_by_user_uuid_fkey;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_uuid_fkey;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_user_uuid_fkey
  FOREIGN KEY (user_uuid_id) REFERENCES users(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE subscriptions VALIDATE CONSTRAINT subscriptions_user_uuid_fkey;

ALTER TABLE listing_analytics_events DROP CONSTRAINT IF EXISTS listing_analytics_events_property_request_uuid_fkey;
ALTER TABLE listing_analytics_events
  ADD CONSTRAINT listing_analytics_events_property_request_uuid_fkey
  FOREIGN KEY (property_request_uuid_id) REFERENCES property_requests(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE listing_analytics_events VALIDATE CONSTRAINT listing_analytics_events_property_request_uuid_fkey;

ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_requester_user_uuid_fkey;
ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_requester_user_uuid_fkey
  FOREIGN KEY (requester_user_uuid_id) REFERENCES users(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE chat_conversations VALIDATE CONSTRAINT chat_conversations_requester_user_uuid_fkey;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_conversation_uuid_fkey;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_conversation_uuid_fkey
  FOREIGN KEY (conversation_uuid_id) REFERENCES chat_conversations(uuid_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE chat_messages VALIDATE CONSTRAINT chat_messages_conversation_uuid_fkey;

-- 7) Enforce not-null on row UUID identifiers after backfill.
ALTER TABLE users ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE password_reset_otps ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE user_sessions ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE main_admin_profile_media ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE property_requests ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE property_request_status_history ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE career_applications ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE career_application_status_history ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE activity_logs ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE listing_analytics_events ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE property_price_history ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE property_analytics_daily ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE user_analytics ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE lead_analytics ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE user_favorite_listings ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE chat_conversations ALTER COLUMN uuid_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN uuid_id SET NOT NULL;