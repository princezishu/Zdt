-- Phase 3 UUID Cutover (Contract)
-- WARNING: Run only after application is fully switched to UUID reads/writes.
-- Safety gate: must set SET app.uuid_cutover_confirm = 'yes'; in session.

DO $$
BEGIN
  IF current_setting('app.uuid_cutover_confirm', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Set app.uuid_cutover_confirm = yes before running UUID contract migration';
  END IF;
END $$;

BEGIN;

-- Preserve legacy BIGINT ids before renaming UUID identifiers.
ALTER TABLE users RENAME COLUMN id TO legacy_id_bigint;
ALTER TABLE users RENAME COLUMN uuid_id TO id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_legacy_id_bigint_unique ON users(legacy_id_bigint);

ALTER TABLE property_requests RENAME COLUMN id TO legacy_id_bigint;
ALTER TABLE property_requests RENAME COLUMN uuid_id TO id;
ALTER TABLE property_requests DROP CONSTRAINT IF EXISTS property_requests_pkey;
ALTER TABLE property_requests ADD CONSTRAINT property_requests_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_requests_legacy_id_bigint_unique ON property_requests(legacy_id_bigint);

ALTER TABLE chat_conversations RENAME COLUMN id TO legacy_id_bigint;
ALTER TABLE chat_conversations RENAME COLUMN uuid_id TO id;
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_pkey;
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_legacy_id_bigint_unique ON chat_conversations(legacy_id_bigint);

-- Switch core foreign keys to UUID columns while retaining legacy columns for rollback.
ALTER TABLE user_sessions RENAME COLUMN user_id TO legacy_user_id_bigint;
ALTER TABLE user_sessions RENAME COLUMN user_uuid_id TO user_id;

ALTER TABLE subscriptions RENAME COLUMN user_id TO legacy_user_id_bigint;
ALTER TABLE subscriptions RENAME COLUMN user_uuid_id TO user_id;

ALTER TABLE property_requests RENAME COLUMN submitted_by_user_id TO legacy_submitted_by_user_id_bigint;
ALTER TABLE property_requests RENAME COLUMN submitted_by_user_uuid_id TO submitted_by_user_id;

ALTER TABLE listing_analytics_events RENAME COLUMN property_request_id TO legacy_property_request_id_bigint;
ALTER TABLE listing_analytics_events RENAME COLUMN property_request_uuid_id TO property_request_id;

ALTER TABLE chat_messages RENAME COLUMN conversation_id TO legacy_conversation_id_bigint;
ALTER TABLE chat_messages RENAME COLUMN conversation_uuid_id TO conversation_id;

COMMIT;

-- Post-contract follow-up (manual):
-- 1) Update every remaining *_id BIGINT reference to UUID equivalent.
-- 2) Regenerate API types/openapi schemas.
-- 3) Remove bridge triggers/functions after 2 release cycles.
-- 4) Remove legacy_* bigint columns only after verified backup snapshot.