import fs from 'fs';
import path from 'path';
import { pool } from '../src/db.js';

function resolveWorkspacePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--'));
  const enableUuidContractGuard = args.includes('--uuid-cutover-confirm');

  if (!fileArg) {
    console.error('Usage: node scripts/run-sql-file.js <sql-file> [--uuid-cutover-confirm]');
    process.exitCode = 1;
    return;
  }

  const filePath = resolveWorkspacePath(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`SQL file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  if (!sql.trim()) {
    console.error(`SQL file is empty: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    if (enableUuidContractGuard) {
      await client.query(`SET app.uuid_cutover_confirm = 'yes'`);
    }
    await client.query(sql);
    console.log(`Applied SQL file: ${filePath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to apply SQL file.');
  console.error(error);
  process.exit(1);
});
