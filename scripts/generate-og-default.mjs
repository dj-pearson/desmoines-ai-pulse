#!/usr/bin/env node
/**
 * Renders public/og-default.png, the social card every page falls back to.
 *
 * WEB-SEO-044. The fallback used to be /DMI-Logo.png - an 800x800 SQUARE -
 * while every page declares twitter:card=summary_large_image, which wants
 * roughly 1.91:1. Every hub, landing and static page therefore shared as a
 * cropped or letterboxed logo; only the entity detail pages, which call the
 * og-image edge function, got a proper card.
 *
 * Committed as a script rather than hand-made in a design tool so the card can
 * be regenerated when the wordmark or the palette moves.
 *
 * Usage: node scripts/generate-og-default.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1200, H = 630;

// Resize to a BUFFER first, then read that buffer's dimensions: reading
// metadata off the un-executed pipeline returns the ORIGINAL size, so the
// white canvas and the alpha mask end up different shapes and only part of
// the wordmark gets repainted.
const resized = await sharp('public/DMI-Logo-Text.png').resize({ width: 560 }).png().toBuffer();
const { width: ww, height: wh } = await sharp(resized).metadata();
const alpha = await sharp(resized).ensureAlpha().extractChannel('alpha').toBuffer();
const wordmark = await sharp({ create: { width: ww, height: wh, channels: 3, background: '#ffffff' } })
  .joinChannel(alpha)
  .png()
  .toBuffer();

const bg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#04143f"/>
      <stop offset="100%" stop-color="#0a2b86"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="${H - 12}" width="${W}" height="12" fill="#c30e31"/>
  <rect x="88" y="392" width="118" height="7" rx="3.5" fill="#c30e31"/>
  <text x="88" y="462" font-family="DejaVu Sans, sans-serif" font-size="38" fill="rgba(255,255,255,0.86)">Events, restaurants and what to do in Des Moines</text>
</svg>`;

const out = await sharp(Buffer.from(bg))
  .composite([{ input: wordmark, left: 88, top: 392 - 40 - wh }])
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync('public/og-default.png', out);
console.log(`wrote public/og-default.png - 1200x630, ${(out.length / 1024).toFixed(0)} kB (wordmark ${ww}x${wh})`);
