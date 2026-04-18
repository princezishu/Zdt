/**
 * apply-schema-supabase.js
 *
 * Connects to the Supabase PostgreSQL database configured in .env,
 * strips psql-only meta-commands (CREATE DATABASE / \c) from schema.sql,
 * applies the schema, then verifies table creation.
 *
 * Usage:
 *   node scripts/apply-schema-supabase.js
 *
 * No business logic is changed. Only the DB connection is used.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  describeDatabaseConnection,
  resolveDatabaseConnectionConfig,
} from '../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let databaseConnection;
let connectionInfo;
try {
  databaseConnection = resolveDatabaseConnectionConfig();
  connectionInfo = describeDatabaseConnection(databaseConnection);
} catch (error) {
  console.error(`\n❌  ${error.message}`);
  console.error('    Check your server/.env file.\n');
  process.exit(1);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  ZDT Realty — Supabase Schema Setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Source  : ${connectionInfo.source}`);
console.log(`  Host    : ${connectionInfo.host || '(from connection string)'}`);
console.log(`  Database: ${connectionInfo.database || '(default)'}`);
console.log(`  Port    : ${connectionInfo.port || '(default)'}`);
console.log(`  SSL     : ${connectionInfo.sslEnabled ? '✅ enabled' : '❌ disabled'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ── 3. Load schema.sql ────────────────────────────────────────────────────────
const schemaPath = path.resolve(__dirname, '../sql/schema.sql');
if (!fs.existsSync(schemaPath)) {
  console.error(`❌  Schema file not found: ${schemaPath}`);
  process.exit(1);
}

let rawSql = fs.readFileSync(schemaPath, 'utf8');

// Strip psql meta-commands that are incompatible with the pg driver:
//   CREATE DATABASE ...;
//   \c <dbname>
rawSql = rawSql
  .split('\n')
  .filter((line) => {
    const trimmed = line.trim();
    // Skip CREATE DATABASE statement
    if (/^CREATE\s+DATABASE\b/i.test(trimmed)) return false;
    // Skip psql \connect / \c meta-commands
    if (/^\\c\b/.test(trimmed)) return false;
    return true;
  })
  .join('\n');

if (!rawSql.trim()) {
  console.error('❌  Schema file is empty after pre-processing.');
  process.exit(1);
}

console.log(`📄  Schema file loaded: ${schemaPath}`);
console.log(`    (psql meta-commands stripped — compatible with pg driver)\n`);

// ── 4. Connect and apply ───────────────────────────────────────────────────────
const client = new pg.Client({
  ...databaseConnection.pgConfig,
  connectionTimeoutMillis: 10_000,
});

async function main() {
  // Step A: Connect
  console.log('🔌  Connecting to Supabase PostgreSQL...');
  try {
    await client.connect();
    console.log('✅  Connected successfully.\n');
  } catch (err) {
    console.error('❌  Connection failed:');
    console.error(`    ${err.message}`);
    console.error('\n    Possible causes:');
    console.error('      • Wrong SUPABASE_DB_POOLER_URL / SUPABASE_DB_URL / DATABASE_URL');
    console.error('      • Wrong host-based Supabase DB credentials in .env');
    console.error('      • Supabase project is paused or network blocked');
    console.error('      • SSL settings are incompatible with your Supabase connection\n');
    process.exit(1);
  }

  // Step B: Ping
  try {
    await client.query('SELECT 1');
    console.log('🏓  DB ping successful.\n');
  } catch (err) {
    console.error('❌  Ping failed:', err.message);
    await client.end();
    process.exit(1);
  }

  // Step C: Apply schema
  console.log('📦  Applying schema.sql to Supabase...\n');
  try {
    await client.query(rawSql);
    console.log('✅  Schema applied successfully.\n');
  } catch (err) {
    console.error('❌  Schema application failed:');
    console.error(`    ${err.message}`);
    if (err.detail)   console.error(`    Detail  : ${err.detail}`);
    if (err.hint)     console.error(`    Hint    : ${err.hint}`);
    if (err.position) console.error(`    Position: ${err.position}`);
    await client.end();
    process.exit(1);
  }

  // Step D: Verify tables
  console.log('🔍  Verifying tables in public schema...\n');
  const expectedTables = [
    'users',
    'user_profiles',
    'user_sessions',
    'password_reset_otps',
    'login_2fa_challenges',
    'phone_verification_otps',
    'property_requests',
    'property_request_status_history',
    'career_applications',
    'career_application_status_history',
    'activity_logs',
    'main_admin_profile_media',
    'user_favorite_listings',
    'chat_conversations',
    'chat_messages',
    'chat_message_receipts',
    'eauction_sources',
    'builder_companies',
    'builder_company_banners',
    'companies',
    'projects',
  ];

  let result;
  try {
    result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);
  } catch (err) {
    console.error('❌  Could not query table list:', err.message);
    await client.end();
    process.exit(1);
  }

  const existingTables = new Set(result.rows.map((r) => r.table_name));

  console.log('  Tables found in Supabase public schema:');
  const missing2 = [];
  for (const table of expectedTables) {
    if (existingTables.has(table)) {
      console.log(`    ✅  ${table}`);
    } else {
      console.log(`    ❌  ${table}  ← MISSING`);
      missing2.push(table);
    }
  }

  // Also list any extra tables (not in expected list)
  const extra = [...existingTables].filter((t) => !expectedTables.includes(t));
  if (extra.length > 0) {
    console.log('\n  Additional tables in DB (not in expected list):');
    for (const t of extra) console.log(`    ℹ️   ${t}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (missing2.length === 0) {
    console.log('🎉  All expected tables are present. Schema is ready!');
  } else {
    console.error(`⚠️   ${missing2.length} expected table(s) missing: ${missing2.join(', ')}`);
    console.error('    Re-check schema.sql or check Supabase logs.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await client.end();

  if (missing2.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌  Unexpected error:');
  console.error(`    ${err.message || err}`);
  client.end().catch(() => {});
  process.exit(1);
});
