// Throwaway: run the same axe assertion tests/accessibility.spec.ts makes, over
// every page it covers, to see whether an axe-only CI gate (WEB-CI-021 AC2) is
// achievable now that the contrast work is done.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };
const shell = fs.readFileSync(path.join(DIST, 'index.html'));
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  for (const c of [u.replace(/^\/+/, ''), path.join(u.replace(/^\/+/, ''), 'index.html')]) {
    const f = path.join(DIST, c);
    if (c && f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
      return;
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(shell);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const only = process.argv[2];
const paths0 = fs.readFileSync('tests/accessibility.spec.ts', 'utf8')
  .split('];')[0]
  .match(/path: '([^']+)'/g)
  ?.map((m) => m.slice(7, -1)) ?? [];
const paths = only ? paths0.filter((x) => x === only) : paths0;

const browser = await chromium.launch();
const totals = new Map();
let clean = 0;

for (const p of paths) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const by = r.violations.map((v) => `${v.id}(${v.nodes.length})`);
    if (process.argv[2] === p) {
      for (const v of r.violations) {
        const seen = new Map();
        for (const n of v.nodes) {
          const m = n.any?.[0]?.message || '';
          const fg = /foreground color: (#[0-9a-f]+)/i.exec(m)?.[1];
          const bg = /background color: (#[0-9a-f]+)/i.exec(m)?.[1];
          const cr = /contrast of ([\d.]+)/i.exec(m)?.[1];
          const key = fg ? `${fg} on ${bg} = ${cr}` : (n.html || '').slice(0, 90);
          if (!seen.has(key)) seen.set(key, { n: 0, html: (n.html || '').slice(0, 100) });
          seen.get(key).n++;
        }
        console.log(`    --- ${v.id} ---`);
        for (const [k, o] of [...seen].sort((a, b) => b[1].n - a[1].n).slice(0, 5)) {
          console.log(`      ${String(o.n).padStart(3)}x ${k}`);
          console.log(`           ${o.html}`);
        }
      }
    }
    for (const v of r.violations) totals.set(v.id, (totals.get(v.id) || 0) + v.nodes.length);
    if (!by.length) clean++;
    console.log(`  ${p.padEnd(26)} ${by.join(' ') || 'CLEAN'}`);
  } catch (e) {
    console.log(`  ${p.padEnd(26)} ERROR ${String(e.message).slice(0, 50)}`);
  }
  await ctx.close();
}

console.log(`\n${clean}/${paths.length} pages clean`);
console.log('remaining violations by rule:', [...totals].map(([k, n]) => `${k}=${n}`).join(' ') || 'NONE');
await browser.close();
server.close();
process.exit(0);
