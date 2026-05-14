// Regenerates Android launcher icons from public/DMI-Icon-1024.png.
// Run with: node scripts/generate-android-launcher-icons.mjs
//
// Outputs (relative to android/app/src/main/res):
//   mipmap-mdpi/ic_launcher.png            48x48   (legacy, white square)
//   mipmap-mdpi/ic_launcher_round.png      48x48   (legacy, white circle)
//   mipmap-mdpi/ic_launcher_foreground.png 108x108 (adaptive foreground, transparent)
//   ...and equivalents for hdpi/xhdpi/xxhdpi/xxxhdpi
//
// Adaptive icon XML and background color resource are committed as static
// files alongside this script and do not need to be regenerated.

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const source = resolve(repoRoot, "public/DMI-Icon-1024.png");
const resDir = resolve(repoRoot, "android/app/src/main/res");

const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

// Legacy launcher icon sizes (dp == px at mdpi baseline).
const legacy = [
  { density: "mdpi", size: 48 },
  { density: "hdpi", size: 72 },
  { density: "xhdpi", size: 96 },
  { density: "xxhdpi", size: 144 },
  { density: "xxxhdpi", size: 192 },
];

// Adaptive foreground must be 108x108dp; only inner 66x66dp is guaranteed
// visible after the launcher mask. We render the brand mark at 66/108 = 61%
// of the canvas, centered, on transparent.
const adaptive = [
  { density: "mdpi", size: 108 },
  { density: "hdpi", size: 162 },
  { density: "xhdpi", size: 216 },
  { density: "xxhdpi", size: 324 },
  { density: "xxxhdpi", size: 432 },
];

async function writeImage(targetPath, buffer) {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, buffer);
}

async function makeLegacySquare(size) {
  const inner = Math.round(size * 0.78);
  const resized = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

async function makeLegacyRound(size) {
  const square = await makeLegacySquare(size);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  return sharp(square)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function makeAdaptiveForeground(size) {
  const inner = Math.round(size * 0.61);
  const resized = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  for (const { density, size } of legacy) {
    const dir = resolve(resDir, `mipmap-${density}`);
    await writeImage(resolve(dir, "ic_launcher.png"), await makeLegacySquare(size));
    await writeImage(resolve(dir, "ic_launcher_round.png"), await makeLegacyRound(size));
    console.log(`mipmap-${density}/ic_launcher{,_round}.png  ${size}x${size}`);
  }
  for (const { density, size } of adaptive) {
    const dir = resolve(resDir, `mipmap-${density}`);
    await writeImage(resolve(dir, "ic_launcher_foreground.png"), await makeAdaptiveForeground(size));
    console.log(`mipmap-${density}/ic_launcher_foreground.png  ${size}x${size}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
