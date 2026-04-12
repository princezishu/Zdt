import dotenv from 'dotenv';

import { pool } from '../src/db.js';

dotenv.config();

const DEMO_EMAIL_PATTERNS = [
  'seed.%@zdt.local',
  '%.demo@zdtrealty.local',
  'smoke_%@example.com',
  'resmoke_%@example.com',
  'retry_%@example.com',
  'postfix_%@example.com',
  'dbg_%@example.com',
  'codex+%@testmail.local',
];

const DEMO_NAME_PATTERNS = [
  'seed %',
  'smoke user',
  'resmoke user',
  'retry user',
  'post fix',
  'dbg',
  'codex test',
];

function uniqueNumericIds(values) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

async function loadDemoUsers(client) {
  const result = await client.query(
    `
      SELECT id, email, name
      FROM users
      WHERE is_main_admin = FALSE
        AND (
          LOWER(email) LIKE ANY($1::text[])
          OR LOWER(name) LIKE ANY($2::text[])
        )
      ORDER BY id ASC
    `,
    [DEMO_EMAIL_PATTERNS, DEMO_NAME_PATTERNS]
  );

  return result.rows;
}

async function loadIdSet(client, sql, values = []) {
  const result = await client.query(sql, values);
  return uniqueNumericIds(result.rows.map((row) => row.id));
}

async function deleteByIds(client, tableName, idColumn, ids, summary) {
  const safeIds = uniqueNumericIds(ids);
  if (safeIds.length === 0) {
    return;
  }

  const result = await client.query(
    `DELETE FROM "${tableName}" WHERE "${idColumn}" = ANY($1::BIGINT[]) RETURNING "${idColumn}"`,
    [safeIds]
  );

  if (result.rowCount > 0) {
    summary.push({ tableName, deletedCount: result.rowCount });
  }
}

async function deleteWhereUserIds(client, tableName, columnName, userIds, summary) {
  const safeIds = uniqueNumericIds(userIds);
  if (safeIds.length === 0) {
    return;
  }

  const result = await client.query(
    `DELETE FROM "${tableName}" WHERE "${columnName}" = ANY($1::BIGINT[]) RETURNING 1`,
    [safeIds]
  );

  if (result.rowCount > 0) {
    summary.push({ tableName, deletedCount: result.rowCount });
  }
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const demoUsers = await loadDemoUsers(client);
    const demoUserIds = uniqueNumericIds(demoUsers.map((row) => row.id));

    const demoCompanyIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM companies
        WHERE created_by_user_id = ANY($1::BIGINT[])
           OR LOWER(email) LIKE '%.demo@zdtrealty.local'
      `,
      [demoUserIds]
    );

    const demoBuilderCompanyIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM builder_companies
        WHERE created_by_user_id = ANY($1::BIGINT[])
           OR company_code LIKE 'COMP-SEED-%'
           OR name ILIKE 'Seed %'
      `,
      [demoUserIds]
    );

    const demoProjectIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM projects
        WHERE created_by_user_id = ANY($1::BIGINT[])
           OR company_id = ANY($2::BIGINT[])
           OR project_name ILIKE 'SEED %'
      `,
      [demoUserIds, demoCompanyIds]
    );

    const demoPropertyIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM properties
        WHERE posted_by = ANY($1::BIGINT[])
           OR created_by_user_id = ANY($1::BIGINT[])
           OR company_id = ANY($2::BIGINT[])
           OR title = 'Skyline Residence - 3BHK'
      `,
      [demoUserIds, demoCompanyIds]
    );

    const demoRentalIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM rentals
        WHERE posted_by = ANY($1::BIGINT[])
           OR title = 'Harbor Heights - 2BHK'
      `,
      [demoUserIds]
    );

    const demoPropertyRequestIds = await loadIdSet(
      client,
      `
        SELECT id
        FROM property_requests
        WHERE submitted_by_user_id = ANY($1::BIGINT[])
           OR reference_id LIKE 'SEED-LIST-%'
      `,
      [demoUserIds]
    );

    const summary = [];

    await deleteWhereUserIds(client, 'activity_logs', 'actor_user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'audit_logs', 'actor_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'listing_analytics_events', 'actor_user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'news_clicks', 'user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'material_reuse_request_events', 'created_by_user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'material_reuse_requests', 'submitted_by_user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'group_deals', 'created_by_user_id', demoUserIds, summary);
    await deleteWhereUserIds(client, 'career_applications', 'created_account_user_id', demoUserIds, summary);

    await deleteByIds(client, 'property_requests', 'id', demoPropertyRequestIds, summary);
    await deleteByIds(client, 'rentals', 'id', demoRentalIds, summary);
    await deleteByIds(client, 'properties', 'id', demoPropertyIds, summary);
    await deleteByIds(client, 'projects', 'id', demoProjectIds, summary);
    await deleteByIds(client, 'companies', 'id', demoCompanyIds, summary);
    await deleteByIds(client, 'builder_companies', 'id', demoBuilderCompanyIds, summary);
    await deleteByIds(client, 'users', 'id', demoUserIds, summary);

    await client.query('COMMIT');

    console.log('Demo-only cleanup complete.');
    console.log(`Matched demo users: ${demoUsers.length}`);
    for (const row of demoUsers) {
      console.log(`- ${row.id}:${row.email} (${row.name})`);
    }

    if (summary.length > 0) {
      console.log('Deleted rows:');
      for (const entry of summary) {
        console.log(`- ${entry.tableName}: ${entry.deletedCount}`);
      }
    } else {
      console.log('No known demo rows matched the cleanup rules.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
