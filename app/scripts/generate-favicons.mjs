import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');

const sourcePng = path.join(appRoot, 'public', 'images', 'logo-real.png');
const sourceSvg = path.join(appRoot, 'public', 'images', 'favicon-mark.svg');
const outputDirs = [
  path.join(appRoot, 'public'),
  path.join(repoRoot, 'zdt-realty', 'frontend', 'public'),
];

const SIZE_TO_FILE = [
  [16, 'favicon-16x16.png'],
  [32, 'favicon-32x32.png'],
  [48, 'favicon-48x48.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'android-chrome-192x192.png'],
  [512, 'android-chrome-512x512.png'],
];

const webManifest = {
  name: 'ZDT Realty',
  short_name: 'ZDT Realty',
  icons: [
    {
      src: '/android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
  theme_color: '#111318',
  background_color: '#111318',
  display: 'standalone',
};

async function renderPng(size) {
  const sourcePath = await fs
    .access(sourcePng)
    .then(() => sourcePng)
    .catch(() => sourceSvg);

  const sharpInput =
    sourcePath === sourceSvg
      ? sharp(sourcePath, { density: 300 })
      : sharp(sourcePath);

  return sharpInput
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeOutputs(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });

  const pngsBySize = new Map();
  for (const [size, fileName] of SIZE_TO_FILE) {
    const pngBuffer = await renderPng(size);
    pngsBySize.set(size, pngBuffer);
    await fs.writeFile(path.join(targetDir, fileName), pngBuffer);
  }

  const icoBuffer = await pngToIco([
    pngsBySize.get(16),
    pngsBySize.get(32),
    pngsBySize.get(48),
  ]);
  await fs.writeFile(path.join(targetDir, 'favicon.ico'), icoBuffer);

  await fs.copyFile(sourceSvg, path.join(targetDir, 'favicon.svg'));
  await fs.writeFile(
    path.join(targetDir, 'site.webmanifest'),
    `${JSON.stringify(webManifest, null, 2)}\n`,
    'utf8'
  );
}

async function main() {
  await fs.access(sourcePng).catch(async () => {
    await fs.access(sourceSvg);
  });
  for (const targetDir of outputDirs) {
    await writeOutputs(targetDir);
    console.log(`Generated favicon assets in ${targetDir}`);
  }
}

main().catch((error) => {
  console.error('Failed to generate favicons:', error);
  process.exitCode = 1;
});
