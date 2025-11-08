#!/usr/bin/env node
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '../public');

/**
 * Optimize PNG images and create WebP versions
 * This significantly improves performance by reducing image sizes
 */

const images = [
  { name: 'DMI-Logo.png', maxWidth: 800, quality: 85 },
  { name: 'DMI-Logo2.png', maxWidth: 600, quality: 85 },
  { name: 'DMI-Logo-Header.png', maxWidth: 400, quality: 85 },
  { name: 'DMI-Logo-Text.png', maxWidth: 400, quality: 85 },
  { name: 'DMI-Icon.png', maxWidth: 256, quality: 85 },
  { name: 'android-chrome-512x512.png', maxWidth: 512, quality: 85 },
  { name: 'android-chrome-192x192.png', maxWidth: 192, quality: 85 },
];

async function optimizeImage(fileName, maxWidth, quality) {
  const inputPath = path.join(PUBLIC_DIR, fileName);
  const baseName = path.basename(fileName, '.png');
  const optimizedPngPath = path.join(PUBLIC_DIR, `${baseName}.optimized.png`);
  const webpPath = path.join(PUBLIC_DIR, `${baseName}.webp`);

  try {
    const stats = await fs.stat(inputPath);
    const originalSize = stats.size;

    // Create optimized PNG
    await sharp(inputPath)
      .resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .png({
        quality,
        compressionLevel: 9,
        palette: true
      })
      .toFile(optimizedPngPath);

    // Create WebP version (best compression)
    await sharp(inputPath)
      .resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality })
      .toFile(webpPath);

    const pngStats = await fs.stat(optimizedPngPath);
    const webpStats = await fs.stat(webpPath);

    console.log(`✅ ${fileName}:`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(1)} KB`);
    console.log(`   Optimized PNG: ${(pngStats.size / 1024).toFixed(1)} KB (${((1 - pngStats.size / originalSize) * 100).toFixed(1)}% smaller)`);
    console.log(`   WebP: ${(webpStats.size / 1024).toFixed(1)} KB (${((1 - webpStats.size / originalSize) * 100).toFixed(1)}% smaller)`);

  } catch (error) {
    console.error(`❌ Error optimizing ${fileName}:`, error.message);
  }
}

async function main() {
  console.log('🖼️  Starting image optimization...\n');

  for (const { name, maxWidth, quality } of images) {
    await optimizeImage(name, maxWidth, quality);
  }

  console.log('\n✨ Image optimization complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review the .optimized.png and .webp files');
  console.log('2. If satisfied, rename .optimized.png to replace originals');
  console.log('3. Update components to use WebP with PNG fallback');
}

main().catch(console.error);
