import { pool } from '../src/db.js';

function normalizeArg(value) {
  return String(value || '').trim();
}

async function countCandidates({ targetName, applyToAllMismatches }) {
  const whereClauses = [
    "cm.sender_user_id IS NOT NULL",
    "cm.sender_role <> 'system'",
    "COALESCE(NULLIF(BTRIM(cm.sender_name), ''), '') <> COALESCE(NULLIF(BTRIM(u.name), ''), '')",
    `NOT (
      cm.sender_role = 'owner'
      AND (
        LOWER(BTRIM(cm.sender_name)) = 'owner desk'
        OR (
          COALESCE(BTRIM(c.owner_name), '') <> ''
          AND BTRIM(cm.sender_name) = BTRIM(c.owner_name)
        )
      )
    )`,
  ];
  const values = [];

  if (!applyToAllMismatches) {
    values.push(targetName);
    whereClauses.push(`LOWER(BTRIM(cm.sender_name)) = LOWER(BTRIM($${values.length}))`);
  }

  const rows = await pool.query(
    `
      SELECT COUNT(*)::INT AS count
      FROM chat_messages cm
      JOIN users u
        ON u.id = cm.sender_user_id
      LEFT JOIN chat_conversations c
        ON c.id = cm.conversation_id
      WHERE ${whereClauses.join(' AND ')}
    `,
    values
  );

  return Number(rows.rows[0]?.count || 0);
}

async function runBackfill({ targetName, applyToAllMismatches }) {
  const whereClauses = [
    "cm.sender_user_id IS NOT NULL",
    "cm.sender_role <> 'system'",
    "COALESCE(NULLIF(BTRIM(cm.sender_name), ''), '') <> COALESCE(NULLIF(BTRIM(u.name), ''), '')",
    `NOT (
      cm.sender_role = 'owner'
      AND (
        LOWER(BTRIM(cm.sender_name)) = 'owner desk'
        OR (
          COALESCE(BTRIM(c.owner_name), '') <> ''
          AND BTRIM(cm.sender_name) = BTRIM(c.owner_name)
        )
      )
    )`,
  ];
  const values = [];

  if (!applyToAllMismatches) {
    values.push(targetName);
    whereClauses.push(`LOWER(BTRIM(cm.sender_name)) = LOWER(BTRIM($${values.length}))`);
  }

  const result = await pool.query(
    `
      UPDATE chat_messages cm
      SET sender_name = u.name
      FROM users u
      LEFT JOIN chat_conversations c
        ON c.id = cm.conversation_id
      WHERE u.id = cm.sender_user_id
        AND ${whereClauses.join(' AND ')}
    `,
    values
  );

  return Number(result.rowCount || 0);
}

async function main() {
  const args = process.argv.slice(2);
  const applyToAllMismatches = args.includes('--all');
  const dryRun = args.includes('--dry-run');
  const explicitName = normalizeArg(args.find((arg) => !arg.startsWith('--')));
  const targetName = explicitName || 'Zaheer';

  try {
    const pending = await countCandidates({ targetName, applyToAllMismatches });

    if (pending === 0) {
      console.log('No matching chat sender_name rows found for backfill.');
      return;
    }

    if (dryRun) {
      console.log(`Dry run only. Rows that would be updated: ${pending}`);
      return;
    }

    const updated = await runBackfill({ targetName, applyToAllMismatches });
    console.log(`Chat sender_name backfill complete. Updated rows: ${updated}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to backfill chat sender names.');
  console.error(error);
  process.exit(1);
});
