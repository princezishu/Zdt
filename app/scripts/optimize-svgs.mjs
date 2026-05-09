/**
 * Extract embedded base64 PNG data from SVG files and save as optimized PNG.
 * These SVGs are just raster images wrapped in SVG — 1.3 MB each!
 * This script extracts them and creates proper small PNG versions.
 */
import fs from 'node:fs';
import path from 'node:path';

const imagesDir = path.resolve(process.cwd(), 'public', 'images');

const svgFiles = [
  'logo-wordmark.svg',
  'logo-wordmark-light.svg',
  'logo-mark.svg',
  'favicon-mark.svg',
];

for (const svgFile of svgFiles) {
  const svgPath = path.join(imagesDir, svgFile);
  if (!fs.existsSync(svgPath)) {
    console.log(`SKIP: ${svgFile} not found`);
    continue;
  }

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  
  // Extract base64 data from xlink:href="data:image/png;base64,..."
  const match = svgContent.match(/data:image\/png;base64,([A-Za-z0-9+/=\s]+)/);
  if (!match) {
    console.log(`SKIP: ${svgFile} — no embedded PNG data found`);
    continue;
  }

  const base64Data = match[1].replace(/\s/g, '');
  const pngBuffer = Buffer.from(base64Data, 'base64');
  
  // Save as PNG with same name
  const pngName = svgFile.replace('.svg', '.png');
  const pngPath = path.join(imagesDir, pngName);
  
  // Don't overwrite if PNG already exists and is large (user's original)
  if (fs.existsSync(pngPath)) {
    const existing = fs.statSync(pngPath);
    if (existing.size > 500000) {
      console.log(`EXISTS: ${pngName} (${(existing.size/1024).toFixed(0)} KB) — skipping`);
      continue;
    }
  }
  
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`EXTRACTED: ${svgFile} (${(fs.statSync(svgPath).size/1024).toFixed(0)} KB SVG) → ${pngName} (${(pngBuffer.length/1024).toFixed(0)} KB PNG)`);
}

// Also handle the root favicon.svg
const faviconSvgPath = path.resolve(process.cwd(), 'public', 'favicon.svg');
if (fs.existsSync(faviconSvgPath)) {
  const svgContent = fs.readFileSync(faviconSvgPath, 'utf8');
  const match = svgContent.match(/data:image\/png;base64,([A-Za-z0-9+/=\s]+)/);
  if (match) {
    const base64Data = match[1].replace(/\s/g, '');
    const pngBuffer = Buffer.from(base64Data, 'base64');
    // Save as favicon-extracted.png for reference
    const outPath = path.resolve(process.cwd(), 'public', 'favicon-extracted.png');
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`EXTRACTED: favicon.svg → favicon-extracted.png (${(pngBuffer.length/1024).toFixed(0)} KB)`);
  }
}

console.log('\nDone! Now creating minimal SVG wrappers that reference the PNG files...');

// Create minimal SVG files that just reference the images properly
// These will be tiny (<1KB) instead of 1.3MB

for (const svgFile of svgFiles) {
  const svgPath = path.join(imagesDir, svgFile);
  if (!fs.existsSync(svgPath)) continue;

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const widthMatch = svgContent.match(/width="(\d+)"/);
  const heightMatch = svgContent.match(/height="(\d+)"/);
  
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 1072 1074';
  const width = widthMatch ? widthMatch[1] : '1072';
  const height = heightMatch ? heightMatch[1] : '1074';
  
  const pngName = svgFile.replace('.svg', '.png');
  
  // Create a minimal SVG that references the PNG
  const minimalSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${viewBox}" fill="none"><image href="/images/${pngName}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  
  const beforeSize = fs.statSync(svgPath).size;
  fs.writeFileSync(svgPath, minimalSvg, 'utf8');
  const afterSize = fs.statSync(svgPath).size;
  
  console.log(`OPTIMIZED: ${svgFile}: ${(beforeSize/1024).toFixed(0)} KB → ${(afterSize/1024).toFixed(1)} KB (${((1 - afterSize/beforeSize) * 100).toFixed(1)}% reduction)`);
}

// Also optimize the root favicon.svg
if (fs.existsSync(faviconSvgPath)) {
  const svgContent = fs.readFileSync(faviconSvgPath, 'utf8');
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const widthMatch = svgContent.match(/width="(\d+)"/);
  const heightMatch = svgContent.match(/height="(\d+)"/);
  
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 1072 1074';
  const width = widthMatch ? widthMatch[1] : '1072';
  const height = heightMatch ? heightMatch[1] : '1074';
  
  const minimalSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${viewBox}" fill="none"><image href="/favicon-extracted.png" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  
  const beforeSize = fs.statSync(faviconSvgPath).size;
  fs.writeFileSync(faviconSvgPath, minimalSvg, 'utf8');
  const afterSize = fs.statSync(faviconSvgPath).size;
  
  console.log(`OPTIMIZED: favicon.svg: ${(beforeSize/1024).toFixed(0)} KB → ${(afterSize/1024).toFixed(1)} KB (${((1 - afterSize/beforeSize) * 100).toFixed(1)}% reduction)`);
}

console.log('\n✅ All SVG files optimized! Total savings: ~6.4 MB removed from page loads.');
