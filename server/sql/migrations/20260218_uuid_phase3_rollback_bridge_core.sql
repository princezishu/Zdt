-- Phase 3 UUID Cutover (Rollback helpers)
-- Reverts bridge layer only. Does not remove data columns.

DROP TRIGGER IF EXISTS trg_user_sessions_uuid_bridge ON user_sessions;
DROP TRIGGER IF EXISTS trg_property_requests_uuid_bridge ON property_requests;
DROP TRIGGER IF EXISTS trg_property_request_status_history_uuid_bridge ON property_request_status_history;
DROP TRIGGER IF EXISTS trg_subscriptions_uuid_bridge ON subscriptions;
DROP TRIGGER IF EXISTS trg_listing_analytics_events_uuid_bridge ON listing_analytics_events;
DROP TRIGGER IF EXISTS trg_chat_conversations_uuid_bridge ON chat_conversations;
DROP TRIGGER IF EXISTS trg_chat_messages_uuid_bridge ON chat_messages;

DROP FUNCTION IF EXISTS bridge_user_sessions_uuid_ids();
DROP FUNCTION IF EXISTS bridge_property_requests_uuid_ids();
DROP FUNCTION IF EXISTS bridge_property_request_status_history_uuid_ids();
DROP FUNCTION IF EXISTS bridge_subscriptions_uuid_ids();
DROP FUNCTION IF EXISTS bridge_listing_analytics_events_uuid_ids();
DROP FUNCTION IF EXISTS bridge_chat_conversations_uuid_ids();
DROP FUNCTION IF EXISTS bridge_chat_messages_uuid_ids();

DROP FUNCTION IF EXISTS lookup_user_uuid(BIGINT);
DROP FUNCTION IF EXISTS lookup_user_id(UUID);
DROP FUNCTION IF EXISTS lookup_property_request_uuid(BIGINT);
DROP FUNCTION IF EXISTS lookup_property_request_id(UUID);
DROP FUNCTION IF EXISTS lookup_chat_conversation_uuid(BIGINT);
DROP FUNCTION IF EXISTS lookup_chat_conversation_id(UUID);
DROP FUNCTION IF EXISTS lookup_career_application_uuid(BIGINT);
DROP FUNCTION IF EXISTS lookup_career_application_id(UUID);

ALTER TABLE password_reset_otps DROP CONSTRAINT IF EXISTS password_reset_otps_user_uuid_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_uuid_fkey;
ALTER TABLE property_requests DROP CONSTRAINT IF EXISTS property_requests_submitted_by_user_uuid_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_uuid_fkey;
ALTER TABLE listing_analytics_events DROP CONSTRAINT IF EXISTS listing_analytics_events_property_request_uuid_fkey;
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_requester_user_uuid_fkey;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_conversation_uuid_fkey;