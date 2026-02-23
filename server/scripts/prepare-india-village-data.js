import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawnSync } from 'child_process';

const DEFAULT_ZIP_URL =
  'https://raw.githubusercontent.com/planemad/india-local-government-directory/main/village-directory.csv.zip';
const zipUrl = String(process.env.INDIA_VILLAGE_DATA_ZIP_URL || DEFAULT_ZIP_URL).trim();
const dataDir = path.resolve(process.cwd(), 'data');
const zipPath = path.resolve(dataDir, 'village-directory.csv.zip');
const csvPath = path.resolve(dataDir, 'village-directory.csv');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);

    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(destinationPath, () => {
          const redirectUrl = new URL(response.headers.location, url).toString();
          downloadFile(redirectUrl, destinationPath).then(resolve).catch(reject);
        });
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destinationPath, () => {
          reject(new Error(`Failed to download dataset zip (HTTP ${response.statusCode || 'unknown'}).`));
        });
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', (error) => {
      file.close();
      fs.unlink(destinationPath, () => reject(error));
    });
  });
}

function extractZipArchive(sourceZipPath, destinationDir) {
  if (process.platform === 'win32') {
    const escapedZipPath = sourceZipPath.replace(/'/g, "''");
    const escapedDestination = destinationDir.replace(/'/g, "''");
    const command = `Expand-Archive -Path '${escapedZipPath}' -DestinationPath '${escapedDestination}' -Force`;
    const result = spawnSync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'inherit' }
    );
    if (result.status !== 0) {
      throw new Error('Failed to extract village-directory.zip using PowerShell.');
    }
    return;
  }

  const result = spawnSync('unzip', ['-o', sourceZipPath, '-d', destinationDir], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Failed to extract village-directory.zip. Install unzip and retry.');
  }
}

function printSummary() {
  const zipBytes = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0;
  const csvBytes = fs.existsSync(csvPath) ? fs.statSync(csvPath).size : 0;
  console.log(`[india-villages] Zip saved: ${zipPath} (${zipBytes} bytes)`);
  console.log(`[india-villages] CSV ready: ${csvPath} (${csvBytes} bytes)`);
}

async function run() {
  ensureDir(dataDir);
  console.log(`[india-villages] Downloading dataset zip from ${zipUrl}`);
  await downloadFile(zipUrl, zipPath);

  console.log('[india-villages] Extracting dataset zip...');
  extractZipArchive(zipPath, dataDir);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Extract succeeded but CSV was not found at ${csvPath}`);
  }

  printSummary();
  console.log('[india-villages] Ready. Server endpoint: GET /api/locations/india-suggest?q=<text>');
}

run().catch((error) => {
  console.error(`[india-villages] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

