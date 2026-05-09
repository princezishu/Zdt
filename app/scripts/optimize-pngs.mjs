/**
 * Optimize large PNG images by resizing and compressing them.
 * Target: logo PNGs from ~1MB → <100KB
 */
import fs from 'node:fs';
import path from 'node:path';

const imagesDir = path.resolve(process.cwd(), 'public', 'images');

// PNGs to optimize with target max dimension
const targets = [
  { file: 'logo-wordmark.png', maxWidth: 600, maxHeight: 600 },
  { file: 'logo-wordmark-light.png', maxWidth: 600, maxHeight: 600 },
  { file: 'logo-mark.png', maxWidth: 512, maxHeight: 512 },
  { file: 'favicon-mark.png', maxWidth: 512, maxHeight: 512 },
  { file: 'logo-real.png', maxWidth: 600, maxHeight: 600 },
];

async function optimizePng(filePath, maxWidth, maxHeight) {
  try {
    const sharp = (await import('sharp')).default;
    const stats = fs.statSync(filePath);
    const beforeKB = (stats.size / 1024).toFixed(0);
    
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    let pipeline = image;
    
    // Only resize if larger than max dimensions
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    
    // Optimize PNG compression
    const optimized = await pipeline
      .png({ quality: 85, compressionLevel: 9, palette: true })
      .toBuffer();
    
    fs.writeFileSync(filePath, optimized);
    const afterKB = (optimized.length / 1024).toFixed(0);
    const reduction = ((1 - optimized.length / stats.size) * 100).toFixed(1);
    
    console.log(`✅ ${path.basename(filePath)}: ${beforeKB} KB → ${afterKB} KB (${reduction}% smaller)`);
  } catch (err) {
    console.log(`❌ ${path.basename(filePath)}: ${err.message}`);
  }
}

async function main() {
  let sharpAvailable = false;
  try {
    await import('sharp');
    sharpAvailable = true;
  } catch {
    console.log('sharp not installed. Installing...');
    const { execSync } = await import('node:child_process');
    execSync('npm install sharp --no-save', { stdio: 'inherit', cwd: process.cwd() });
    sharpAvailable = true;
  }
  
  if (!sharpAvailable) {
    console.log('Could not install sharp. Please run: npm install sharp');
    process.exit(1);
  }
  
  for (const target of targets) {
    const filePath = path.join(imagesDir, target.file);
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP: ${target.file} not found`);
      continue;
    }
    await optimizePng(filePath, target.maxWidth, target.maxHeight);
  }
  
  // Also optimize the root favicon-extracted.png
  const faviconExtracted = path.resolve(process.cwd(), 'public', 'favicon-extracted.png');
  if (fs.existsSync(faviconExtracted)) {
    await optimizePng(faviconExtracted, 256, 256);
  }
  
  console.log('\n✅ PNG optimization complete!');
}

main().catch(console.error);
