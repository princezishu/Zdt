# UUID Phase 3 Rollout Guide

## Files
- `20260218_uuid_phase3_expand_core.sql`
- `20260218_uuid_phase3_backfill_bridge_core.sql`
- `20260218_uuid_phase3_contract_core.sql`
- `20260218_uuid_phase3_rollback_bridge_core.sql`

## Run order (production-safe)
1. Run expand migration.
2. Deploy app (still BIGINT reads/writes).
3. Run backfill+bridge migration.
4. Verify dual-write integrity for at least 1 release cycle.
5. Deploy app version that reads UUID columns.
6. Run contract migration in maintenance window.

## Contract safety switch
Before contract migration, run:

```sql
SET app.uuid_cutover_confirm = 'yes';
```

## Validation queries

```sql
-- No missing UUID row ids
SELECT 'users' AS table_name, COUNT(*) AS missing FROM users WHERE uuid_id IS NULL
UNION ALL
SELECT 'property_requests', COUNT(*) FROM property_requests WHERE uuid_id IS NULL
UNION ALL
SELECT 'chat_conversations', COUNT(*) FROM chat_conversations WHERE uuid_id IS NULL;

-- Bridge consistency checks
SELECT COUNT(*) AS mismatched_user_sessions
FROM user_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.user_uuid_id IS DISTINCT FROM u.uuid_id;

SELECT COUNT(*) AS mismatched_subscriptions
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.user_uuid_id IS DISTINCT FROM u.uuid_id;

SELECT COUNT(*) AS mismatched_listing_events
FROM listing_analytics_events e
JOIN property_requests p ON p.id = e.property_request_id
WHERE e.property_request_uuid_id IS DISTINCT FROM p.uuid_id;
```

## Rollback
If bridge rollout fails before contract stage, run:
- `20260218_uuid_phase3_rollback_bridge_core.sql`

If contract stage fails mid-rollout, restore from DB snapshot and redeploy BIGINT-compatible app build.