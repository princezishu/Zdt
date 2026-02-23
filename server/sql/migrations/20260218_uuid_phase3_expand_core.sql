-- Phase 3 UUID Cutover (Expand)
-- Safe, additive migration. Does not break existing BIGINT-based code paths.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add UUID row identifiers for core tables.
ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE main_admin_profile_media ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE property_requests ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE property_request_status_history ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE career_application_status_history ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE listing_analytics_events ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE property_price_history ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE property_analytics_daily ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE lead_analytics ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE user_favorite_listings ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

-- 2) Add UUID bridge foreign key columns.
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS user_uuid_id UUID;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_uuid_id UUID;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS revoked_by_user_uuid_id UUID;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_uuid_id UUID;
ALTER TABLE main_admin_profile_media ADD COLUMN IF NOT EXISTS user_uuid_id UUID;

ALTER TABLE property_requests ADD COLUMN IF NOT EXISTS submitted_by_user_uuid_id UUID;
ALTER TABLE property_requests ADD COLUMN IF NOT EXISTS assigned_to_user_uuid_id UUID;
ALTER TABLE property_requests ADD COLUMN IF NOT EXISTS created_by_team_member_uuid_id UUID;
ALTER TABLE property_requests ADD COLUMN IF NOT EXISTS assigned_by_admin_uuid_id UUID;

ALTER TABLE property_request_status_history ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;
ALTER TABLE property_request_status_history ADD COLUMN IF NOT EXISTS changed_by_user_uuid_id UUID;

ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS reviewed_by_user_uuid_id UUID;
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS created_account_user_uuid_id UUID;

ALTER TABLE career_application_status_history ADD COLUMN IF NOT EXISTS career_application_uuid_id UUID;
ALTER TABLE career_application_status_history ADD COLUMN IF NOT EXISTS changed_by_user_uuid_id UUID;

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_user_uuid_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_uuid_id UUID;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_uuid_id UUID;

ALTER TABLE listing_analytics_events ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;
ALTER TABLE listing_analytics_events ADD COLUMN IF NOT EXISTS actor_user_uuid_id UUID;
ALTER TABLE property_price_history ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;
ALTER TABLE property_price_history ADD COLUMN IF NOT EXISTS changed_by_user_uuid_id UUID;
ALTER TABLE property_analytics_daily ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;
ALTER TABLE user_analytics ADD COLUMN IF NOT EXISTS user_uuid_id UUID;
ALTER TABLE lead_analytics ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;

ALTER TABLE user_favorite_listings ADD COLUMN IF NOT EXISTS user_uuid_id UUID;
ALTER TABLE user_favorite_listings ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS requester_user_uuid_id UUID;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS owner_user_uuid_id UUID;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS property_request_uuid_id UUID;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS created_by_user_uuid_id UUID;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_uuid_id UUID;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_user_uuid_id UUID;

-- 3) Row UUID indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid_id_unique ON users(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_otps_uuid_id_unique ON password_reset_otps(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_uuid_id_unique ON user_sessions(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_uuid_id_unique ON user_profiles(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_main_admin_profile_media_uuid_id_unique ON main_admin_profile_media(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_requests_uuid_id_unique ON property_requests(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_request_status_history_uuid_id_unique ON property_request_status_history(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_applications_uuid_id_unique ON career_applications(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_application_status_history_uuid_id_unique ON career_application_status_history(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_logs_uuid_id_unique ON activity_logs(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_uuid_id_unique ON audit_logs(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_uuid_id_unique ON subscriptions(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_analytics_events_uuid_id_unique ON listing_analytics_events(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_price_history_uuid_id_unique ON property_price_history(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analytics_daily_uuid_id_unique ON property_analytics_daily(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analytics_uuid_id_unique ON user_analytics(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_analytics_uuid_id_unique ON lead_analytics(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_favorite_listings_uuid_id_unique ON user_favorite_listings(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_uuid_id_unique ON chat_conversations(uuid_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_uuid_id_unique ON chat_messages(uuid_id);

-- 4) Bridge column indexes.
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_uuid_id ON password_reset_otps(user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_uuid_id ON user_sessions(user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_by_user_uuid_id ON user_sessions(revoked_by_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_uuid_id ON user_profiles(user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_main_admin_profile_media_user_uuid_id ON main_admin_profile_media(user_uuid_id);

CREATE INDEX IF NOT EXISTS idx_property_requests_submitted_by_user_uuid_id ON property_requests(submitted_by_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_to_user_uuid_id ON property_requests(assigned_to_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_requests_created_by_team_member_uuid_id ON property_requests(created_by_team_member_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_requests_assigned_by_admin_uuid_id ON property_requests(assigned_by_admin_uuid_id);

CREATE INDEX IF NOT EXISTS idx_prsh_property_request_uuid_id ON property_request_status_history(property_request_uuid_id);
CREATE INDEX IF NOT EXISTS idx_prsh_changed_by_user_uuid_id ON property_request_status_history(changed_by_user_uuid_id);

CREATE INDEX IF NOT EXISTS idx_career_applications_reviewed_by_user_uuid_id ON career_applications(reviewed_by_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_career_applications_created_account_user_uuid_id ON career_applications(created_account_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_cash_career_application_uuid_id ON career_application_status_history(career_application_uuid_id);
CREATE INDEX IF NOT EXISTS idx_cash_changed_by_user_uuid_id ON career_application_status_history(changed_by_user_uuid_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user_uuid_id ON activity_logs(actor_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_uuid_id ON audit_logs(actor_uuid_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_uuid_id ON subscriptions(user_uuid_id);

CREATE INDEX IF NOT EXISTS idx_listing_analytics_events_property_request_uuid_id ON listing_analytics_events(property_request_uuid_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_events_actor_user_uuid_id ON listing_analytics_events(actor_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_price_history_property_request_uuid_id ON property_price_history(property_request_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_price_history_changed_by_user_uuid_id ON property_price_history(changed_by_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_property_analytics_daily_property_request_uuid_id ON property_analytics_daily(property_request_uuid_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_uuid_id ON user_analytics(user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_lead_analytics_property_request_uuid_id ON lead_analytics(property_request_uuid_id);

CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_user_uuid_id ON user_favorite_listings(user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_listings_property_request_uuid_id ON user_favorite_listings(property_request_uuid_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_requester_user_uuid_id ON chat_conversations(requester_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner_user_uuid_id ON chat_conversations(owner_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_property_request_uuid_id ON chat_conversations(property_request_uuid_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_by_user_uuid_id ON chat_conversations(created_by_user_uuid_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_uuid_id ON chat_messages(conversation_uuid_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_user_uuid_id ON chat_messages(sender_user_uuid_id);