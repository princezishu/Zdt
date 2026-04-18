/**
 * Phase 1 System Verification Script
 * 
 * Tests:
 * 1. Database connection (Supabase PostgreSQL)
 * 2. Tables exist and can be queried
 * 3. Supabase Auth configuration readiness
 * 4. Cloudinary upload test (uploads a tiny test image, then deletes it)
 * 5. Non-MVP features are disabled
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import {
  describeDatabaseConnection,
  resolveDatabaseConnectionConfig,
} from '../src/config/database.js';

const results = [];
let exitCode = 0;

function pass(name, detail = '') {
  results.push({ status: '✅ PASS', name, detail });
}

function fail(name, detail = '') {
  results.push({ status: '❌ FAIL', name, detail });
  exitCode = 1;
}

function warn(name, detail = '') {
  results.push({ status: '⚠️  WARN', name, detail });
}

function info(name, detail = '') {
  results.push({ status: 'ℹ️  INFO', name, detail });
}

// ── 1. Database Connection ──
async function testDatabaseConnection() {
  let databaseConnection;
  let connectionInfo;
  try {
    databaseConnection = resolveDatabaseConnectionConfig();
    connectionInfo = describeDatabaseConnection(databaseConnection);
  } catch (error) {
    fail('DB env vars', error.message);
    return null;
  }
  pass('DB env vars', `Using ${connectionInfo.source} (${connectionInfo.strategy}).`);

  const dbConfig = {
    ...databaseConnection.pgConfig,
    max: 3,
    connectionTimeoutMillis: 10000,
  };

  const pool = new Pool(dbConfig);
  try {
    const res = await pool.query('SELECT 1 AS ok');
    if (res.rows[0]?.ok === 1) {
      const target = [
        connectionInfo.host,
        connectionInfo.port,
        connectionInfo.database,
      ]
        .filter(Boolean)
        .join(':')
        .replace(/:(?=[^:]+$)/, '/');
      pass(
        'DB connection',
        `Connected to ${connectionInfo.provider} via ${connectionInfo.source}${target ? ` (${target})` : ''} (SSL=${connectionInfo.sslEnabled})`
      );
    } else {
      fail('DB connection', 'SELECT 1 returned unexpected result.');
    }
  } catch (err) {
    fail('DB connection', err.message);
    await pool.end().catch(() => {});
    return null;
  }
  return pool;
}

// ── 2. Tables exist and can be queried ──
async function testTablesExist(pool) {
  if (!pool) {
    fail('Tables check', 'Skipped — no DB connection.');
    return;
  }

  const coreTables = [
    'users',
    'property_requests',
    'user_sessions',
    'user_profiles',
    'activity_logs',
    'audit_logs',
    'career_applications',
  ];

  try {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const existing = res.rows.map(r => r.table_name);
    info('Total tables', `${existing.length} tables found in public schema.`);

    const missingCore = coreTables.filter(t => !existing.includes(t));
    if (missingCore.length > 0) {
      fail('Core tables', `Missing: ${missingCore.join(', ')}`);
    } else {
      pass('Core tables', `All ${coreTables.length} core tables present.`);
    }

    // Quick row-count on users table
    const userCount = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    info('Users table', `${userCount.rows[0].cnt} rows.`);

    // Quick row-count on property_requests table
    const propCount = await pool.query('SELECT COUNT(*) AS cnt FROM property_requests');
    info('Property requests', `${propCount.rows[0].cnt} rows.`);

  } catch (err) {
    fail('Tables check', err.message);
  }
}

async function testPropertiesQuery(pool) {
  if (!pool) {
    fail('Properties query', 'Skipped — no DB connection.');
    return;
  }

  try {
    const rows = await pool.query(`
      SELECT id, title, city, listing_type, created_at
      FROM properties
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 3
    `);

    pass('Properties query', `Fetched ${rows.rowCount} row(s) from properties.`);
    if (rows.rowCount > 0) {
      const sample = rows.rows[0];
      info(
        'Properties sample',
        `Latest property id=${sample.id}, title="${sample.title}", city="${sample.city}", listingType="${sample.listing_type}".`
      );
    }
  } catch (err) {
    fail('Properties query', err.message);
  }
}

// ── 3. Supabase Auth configuration ──
async function testSupabaseAuthConfig() {
  const projectUrl = String(process.env.SUPABASE_PROJECT_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const provider = String(process.env.MANAGED_AUTH_PROVIDER || '').trim().toLowerCase();

  if (!projectUrl) {
    fail('Supabase Auth', 'SUPABASE_PROJECT_URL is not set.');
    return;
  }
  if (!anonKey) {
    fail('Supabase Auth', 'SUPABASE_ANON_KEY is not set.');
    return;
  }
  if (provider !== 'supabase') {
    fail('Supabase Auth', `MANAGED_AUTH_PROVIDER is "${provider}", expected "supabase".`);
    return;
  }

  pass('Supabase Auth env', `Provider=${provider}, URL=${projectUrl}`);

  // Test JWKS endpoint availability
  const jwksUrl = `${projectUrl}/auth/v1/.well-known/jwks.json`;
  try {
    const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const jwks = await response.json();
      const keyCount = jwks?.keys?.length || 0;
      pass('Supabase JWKS', `Endpoint reachable, ${keyCount} key(s) available.`);
    } else {
      fail('Supabase JWKS', `HTTP ${response.status} from ${jwksUrl}`);
    }
  } catch (err) {
    fail('Supabase JWKS', `Could not reach JWKS endpoint: ${err.message}`);
  }

  // Test Supabase Auth signup (with a throwaway email to prove the endpoint works)
  const testEmail = `verify-test-${Date.now()}@test-zdtrealty.local`;
  const testPassword = crypto.randomBytes(16).toString('hex');
  try {
    const signupResponse = await fetch(`${projectUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
      signal: AbortSignal.timeout(15000),
    });
    const signupData = await signupResponse.json();
    if (signupResponse.ok || signupResponse.status === 200 || signupResponse.status === 201) {
      pass('Supabase signup', `Signup endpoint works. User ID: ${signupData?.id || signupData?.user?.id || 'returned'}`);
    } else if (signupResponse.status === 422 && signupData?.msg?.includes?.('disabled')) {
      warn('Supabase signup', 'Email signups may be disabled in Supabase dashboard. Check settings.');
    } else if (signupResponse.status === 429) {
      warn('Supabase signup', 'Rate limited. Endpoint is reachable but throttled.');
    } else {
      // Some error but endpoint responded — still useful info
      warn('Supabase signup', `HTTP ${signupResponse.status}: ${JSON.stringify(signupData).slice(0, 200)}`);
    }
  } catch (err) {
    fail('Supabase signup', `Cannot reach signup endpoint: ${err.message}`);
  }
}

// ── 4. Cloudinary upload test ──
async function testCloudinaryUpload() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    fail('Cloudinary env', 'Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.');
    return;
  }
  pass('Cloudinary env', `Cloud: ${cloudName}, Key: ${apiKey.slice(0, 6)}…`);

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  // Create a tiny 1x1 red PNG as test image
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const folder = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'zdt').trim();
  const testPublicId = `phase1-verify-${Date.now()}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `${folder}/_test`,
          public_id: testPublicId,
          resource_type: 'image',
          overwrite: true,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(pngBuffer);
    });

    if (result?.secure_url && result.secure_url.startsWith('https://')) {
      pass('Cloudinary upload', `URL: ${result.secure_url}`);
    } else {
      fail('Cloudinary upload', 'Upload succeeded but no valid secure_url returned.');
    }

    // Clean up test image
    try {
      await cloudinary.uploader.destroy(result.public_id, {
        resource_type: 'image',
        invalidate: true,
      });
      pass('Cloudinary cleanup', 'Test image deleted.');
    } catch (cleanupErr) {
      warn('Cloudinary cleanup', `Could not delete test image: ${cleanupErr.message}`);
    }

  } catch (err) {
    fail('Cloudinary upload', err.message);
  }
}

// ── 5. Non-MVP features disabled ──
function testNonMvpDisabled() {
  const checks = [
    { env: 'ENABLE_REDIS_QUEUE', expected: 'false', label: 'Redis Queue' },
    { env: 'ENABLE_INGEST_JOBS', expected: 'false', label: 'Ingest Jobs' },
    { env: 'ENABLE_INSIGHTS_SCHEDULER', expected: 'false', label: 'Insights Scheduler' },
    { env: 'ENABLE_ANALYTICS_SCHEDULER', expected: 'false', label: 'Analytics Scheduler' },
    { env: 'EAUCTION_SYNC_ENABLED', expected: 'false', label: 'E-Auction Sync' },
    { env: 'APARTMENT_RENT_AUTO_ALERT_ENABLED', expected: 'false', label: 'Apartment Rent Alerts' },
  ];

  let allGood = true;
  const details = [];
  for (const check of checks) {
    const val = String(process.env[check.env] || '').trim().toLowerCase();
    if (val === check.expected) {
      details.push(`${check.label}=OFF`);
    } else {
      details.push(`${check.label}="${val || '(unset)'}" ← expected "${check.expected}"`);
      allGood = false;
    }
  }

  if (allGood) {
    pass('Non-MVP disabled', details.join(', '));
  } else {
    warn('Non-MVP disabled', details.join('; '));
  }
}

// ── Run all checks ──
async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  ZDT REALTY — PHASE 1 SYSTEM VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const pool = await testDatabaseConnection();
  await testTablesExist(pool);
  await testPropertiesQuery(pool);
  await testSupabaseAuthConfig();
  await testCloudinaryUpload();
  testNonMvpDisabled();

  if (pool) {
    await pool.end().catch(() => {});
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  RESULTS');
  console.log('────────────────────────────────────────────────────────────────\n');

  const maxNameLen = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    const detail = r.detail ? `  →  ${r.detail}` : '';
    console.log(`  ${r.status}  ${r.name.padEnd(maxNameLen)}${detail}`);
  }

  const passes = results.filter(r => r.status.includes('PASS')).length;
  const fails = results.filter(r => r.status.includes('FAIL')).length;
  const warns = results.filter(r => r.status.includes('WARN')).length;
  const infos = results.filter(r => r.status.includes('INFO')).length;

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`  SUMMARY: ${passes} passed, ${fails} failed, ${warns} warnings, ${infos} info`);
  if (fails === 0) {
    console.log('  🎉 SYSTEM IS READY FOR PHASE 1');
  } else {
    console.log('  🚨 SYSTEM HAS ISSUES — FIX BEFORE PROCEEDING');
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
