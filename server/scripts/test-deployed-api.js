/**
 * Deployed Backend API Test Script
 * 
 * Tests:
 * 1. GET /properties — public property listing
 * 2. POST /properties — create property (requires auth)  
 * 3. Database connection via health endpoint
 * 4. Cloudinary upload test
 * 5. Direct DB query test
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { v2 as cloudinary } from 'cloudinary';
import {
  resolveDatabaseConnectionConfig,
  describeDatabaseConnection,
} from '../src/config/database.js';

const BASE_URL = process.argv[2] || 'http://localhost:5000';
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

// ── 1. Database Connection Test ──
async function testDatabaseConnection() {
  console.log('\n── Testing Database Connection ──');
  let connectionConfig;
  let connectionInfo;
  try {
    connectionConfig = resolveDatabaseConnectionConfig();
    connectionInfo = describeDatabaseConnection(connectionConfig);
  } catch (error) {
    fail('DB env config', error.message);
    return null;
  }
  pass('DB env config', `Provider: ${connectionInfo.provider}, Source: ${connectionInfo.source}`);

  const pool = new Pool({
    ...connectionConfig.pgConfig,
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  try {
    const res = await pool.query('SELECT NOW() AS server_time, current_database() AS db_name');
    const row = res.rows[0];
    pass('DB connection', `Connected! DB: ${row.db_name}, Server time: ${row.server_time}`);
  } catch (err) {
    fail('DB connection', err.message);
    await pool.end().catch(() => {});
    return null;
  }
  return pool;
}

// ── 2. Properties Table Query ──
async function testPropertiesQuery(pool) {
  console.log('\n── Testing Properties Table ──');
  if (!pool) {
    fail('Properties query', 'Skipped — no DB connection.');
    return;
  }

  try {
    const countRes = await pool.query('SELECT COUNT(*) AS cnt FROM properties');
    const count = countRes.rows[0].cnt;
    info('Properties count', `${count} total properties in database.`);

    const rows = await pool.query(`
      SELECT id, title, city, listing_type, property_type, price, created_at
      FROM properties
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 5
    `);

    if (rows.rowCount > 0) {
      pass('Properties query', `Fetched ${rows.rowCount} property rows successfully.`);
      for (const row of rows.rows) {
        info('  Property', `id=${row.id} "${row.title}" | ${row.city} | ${row.listing_type} | ₹${row.price || 'N/A'}`);
      }
    } else {
      warn('Properties query', 'Query succeeded but table is empty.');
    }
  } catch (err) {
    fail('Properties query', err.message);
  }
}

// ── 3. Users Table Query ──
async function testUsersQuery(pool) {
  console.log('\n── Testing Users Table ──');
  if (!pool) {
    fail('Users query', 'Skipped — no DB connection.');
    return;
  }

  try {
    const countRes = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    const count = countRes.rows[0].cnt;
    info('Users count', `${count} total users in database.`);

    const rows = await pool.query(`
      SELECT id, name, email, role, created_at
      FROM users
      ORDER BY created_at DESC NULLS LAST
      LIMIT 3
    `);

    if (rows.rowCount > 0) {
      pass('Users query', `Fetched ${rows.rowCount} user rows successfully.`);
      for (const row of rows.rows) {
        info('  User', `id=${row.id} "${row.name}" | ${row.email} | role=${row.role}`);
      }
    } else {
      warn('Users query', 'Query succeeded but table is empty.');
    }
  } catch (err) {
    fail('Users query', err.message);
  }
}

// ── 4. Cloudinary Upload Test ──
async function testCloudinaryUpload() {
  console.log('\n── Testing Cloudinary Upload ──');
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    fail('Cloudinary config', 'Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.');
    return;
  }
  pass('Cloudinary config', `Cloud: ${cloudName}, Key: ${apiKey.slice(0, 6)}…`);

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  // 1x1 red PNG
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const folder = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'zdt').trim();
  const testPublicId = `api-test-${Date.now()}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
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
      stream.end(pngBuffer);
    });

    if (result?.secure_url && result.secure_url.startsWith('https://')) {
      pass('Cloudinary upload', `Success! URL: ${result.secure_url}`);
    } else {
      fail('Cloudinary upload', 'Upload returned but no valid secure_url.');
    }

    // Cleanup
    try {
      await cloudinary.uploader.destroy(result.public_id, {
        resource_type: 'image',
        invalidate: true,
      });
      pass('Cloudinary cleanup', 'Test image deleted successfully.');
    } catch (cleanupErr) {
      warn('Cloudinary cleanup', `Could not delete test image: ${cleanupErr.message}`);
    }
  } catch (err) {
    fail('Cloudinary upload', err.message);
  }
}

// ── 5. HTTP API Test (GET /api/properties) ──
async function testGetProperties() {
  console.log('\n── Testing GET /api/properties (HTTP) ──');
  try {
    const response = await fetch(`${BASE_URL}/api/properties?limit=3`, {
      signal: AbortSignal.timeout(15000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const properties = data.properties || data.data || data || [];
      const count = Array.isArray(properties) ? properties.length : 'unknown';
      pass('GET /api/properties', `HTTP ${response.status} — ${count} properties returned.`);
      
      if (Array.isArray(properties) && properties.length > 0) {
        const p = properties[0];
        info('  First property', `id=${p.id} "${p.title}" | ${p.city}`);
      }
    } else {
      const text = await response.text().catch(() => '');
      fail('GET /api/properties', `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    fail('GET /api/properties', `Request failed: ${err.message}`);
  }
}

// ── 6. HTTP API Test (POST /api/properties - expect 401 without auth) ──
async function testPostProperties() {
  console.log('\n── Testing POST /api/properties (HTTP, no auth) ──');
  try {
    const response = await fetch(`${BASE_URL}/api/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Property',
        city: 'Mumbai',
        propertyType: 'Apartment',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 401 || response.status === 403) {
      pass('POST /api/properties', `HTTP ${response.status} — Auth correctly required (expected behavior).`);
    } else if (response.ok) {
      warn('POST /api/properties', `HTTP ${response.status} — Created without auth! This may be a security issue.`);
    } else {
      const text = await response.text().catch(() => '');
      info('POST /api/properties', `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    fail('POST /api/properties', `Request failed: ${err.message}`);
  }
}

// ── 7. Health Endpoint ──
async function testHealthEndpoint() {
  console.log('\n── Testing GET /health ──');
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(15000),
    });
    
    if (response.ok) {
      const data = await response.json();
      pass('GET /health', `HTTP ${response.status} — ok=${data.ok}`);
    } else {
      fail('GET /health', `HTTP ${response.status}`);
    }
  } catch (err) {
    fail('GET /health', `Request failed (server may not be running): ${err.message}`);
  }
}

// ── Run All Tests ──
async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  ZDT REALTY — DEPLOYED BACKEND API TEST');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════════');

  // Direct DB tests (always work, no server needed)
  const pool = await testDatabaseConnection();
  await testPropertiesQuery(pool);
  await testUsersQuery(pool);
  
  // Cloudinary test (direct SDK, no server needed)
  await testCloudinaryUpload();

  // HTTP API tests (need running server)
  await testHealthEndpoint();
  await testGetProperties();
  await testPostProperties();

  if (pool) {
    await pool.end().catch(() => {});
  }

  // Print results
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  RESULTS SUMMARY');
  console.log('────────────────────────────────────────────────────────────────\n');

  const maxLen = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    const detail = r.detail ? `  →  ${r.detail}` : '';
    console.log(`  ${r.status}  ${r.name.padEnd(maxLen)}${detail}`);
  }

  const passes = results.filter(r => r.status.includes('PASS')).length;
  const fails = results.filter(r => r.status.includes('FAIL')).length;
  const warns = results.filter(r => r.status.includes('WARN')).length;
  const infos = results.filter(r => r.status.includes('INFO')).length;

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`  TOTALS: ${passes} passed, ${fails} failed, ${warns} warnings, ${infos} info`);
  if (fails === 0) {
    console.log('  🎉 ALL TESTS PASSED');
  } else {
    console.log('  🚨 SOME TESTS FAILED — SEE ABOVE');
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
