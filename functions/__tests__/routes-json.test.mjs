/**
 * Offline checks for public/_routes.json (which requests invoke a Pages Function).
 *
 *   npx tsx functions/__tests__/routes-json.test.mjs
 *
 * With include ["/*"] and no exclusions, every /assets/*.js chunk, icon and
 * sitemap request ran functions/_middleware.ts, whose first act is to hand the
 * request straight back with context.next(). That is a billable invocation and
 * a Worker hop on each of the ~460 chunks for nothing. The exclusions skip the
 * function for paths the middleware provably leaves alone.
 *
 * "Provably" is the part this file holds. The middleware's asset bypass is
 * copied below and the copy is checked against the source, so if someone
 * narrows the bypass (starts rewriting sitemaps, say) this fails and says
 * which exclusion would now hide the new behaviour.
 *
 * Exclude wins over include in _routes.json, so an over-broad exclusion
 * silently switches a function off. /media/* must stay routed to
 * functions/media/[[path]].ts, and HTML routes must stay routed to the
 * middleware (prerendered shell rewrites, 404/410 for dead entity slugs).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const routes = JSON.parse(readFileSync(join(root, 'public/_routes.json'), 'utf8'));
const middleware = readFileSync(join(root, 'functions/_middleware.ts'), 'utf8');

let bad = 0;
const ck = (n, c) => { console.log((c ? '  ok    ' : '  FAIL  ') + n); if (!c) bad++; };

// The pass-through, as functions/_middleware.ts onRequest states it. A path
// that matches returns context.next() before any other code runs.
const BYPASS_PREFIX = '/assets/';
const BYPASS_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|json|xml|txt)$/;
const passesThrough = (p) => p.startsWith(BYPASS_PREFIX) || BYPASS_EXT.test(p);

// Cloudflare's matcher: "*" matches any run of characters, slashes included.
const toRe = (rule) =>
  new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const routed = (p) =>
  routes.include.some((r) => toRe(r).test(p)) && !routes.exclude.some((r) => toRe(r).test(p));

console.log('middleware bypass still matches the copy in this test');
ck('pathname.startsWith("/assets/")', middleware.includes('pathname.startsWith("/assets/")'));
ck('extension regex unchanged', middleware.includes(`pathname.match(${BYPASS_EXT.toString()})`));

console.log('\nshape and limits');
ck('version 1', routes.version === 1);
ck('include is ["/*"]', JSON.stringify(routes.include) === '["/*"]');
const total = routes.include.length + routes.exclude.length;
ck(`at most 100 rules (have ${total})`, total <= 100);
ck('every rule starts with "/"', [...routes.include, ...routes.exclude].every((r) => r.startsWith('/')));
ck('every rule at most 100 chars', [...routes.include, ...routes.exclude].every((r) => r.length <= 100));
ck('no duplicate exclusions', new Set(routes.exclude).size === routes.exclude.length);

console.log('\nwhat is excluded');
ck('/assets/* is excluded', routes.exclude.includes('/assets/*'));
for (const p of ['/assets/index-abc123.js', '/assets/vendor-x.css', '/assets/inter-latin.woff2', '/favicon.ico',
                 '/robots.txt', '/sitemap.xml', '/sw.js', '/ads/affiliates/hyatt/160x600.jpeg'])
  ck(`${p} skips the function`, !routed(p));

console.log('\nwhat must still run a function');
ck('no exclusion touches /media', !routes.exclude.some((r) => r === '/*' || r.startsWith('/media')));
for (const p of ['/', '/events', '/events/some-slug', '/restaurants/downtown', '/media/events/x/hero.jpg',
                 '/sitemap-index.xml', '/.well-known/apple-app-site-association'])
  ck(`${p} is routed`, routed(p));

console.log('\nevery exclusion is a path the middleware passes through');
for (const rule of routes.exclude) {
  if (rule.endsWith('/*')) {
    // A prefix rule: no catch-all, a real directory, and every file under it
    // passes through. /assets/ is the vite output dir and passes by prefix.
    const dir = rule.slice(1, -2);
    ck(`${rule}: has no other "*"`, !dir.includes('*') && dir.length > 0);
    if (`/${dir}/` === BYPASS_PREFIX) { ck(`${rule}: bypassed by prefix`, true); continue; }
    const abs = join(root, 'public', dir);
    ck(`${rule}: directory exists in public/`, existsSync(abs) && statSync(abs).isDirectory());
    const walk = (d) => readdirSync(d).flatMap((f) =>
      statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
    const offenders = existsSync(abs)
      ? walk(abs).map((f) => '/' + f.slice(join(root, 'public').length + 1)).filter((p) => !passesThrough(p))
      : [];
    ck(`${rule}: every file passes through${offenders.length ? ' (not: ' + offenders.join(', ') + ')' : ''}`,
       offenders.length === 0);
  } else {
    ck(`${rule}: no wildcard, passes through, exists in public/`,
       !rule.includes('*') && passesThrough(rule) && existsSync(join(root, 'public', rule.slice(1))));
  }
  // No other function lives at an excluded path.
  const top = rule.slice(1).split('/')[0].replace('*', '');
  ck(`${rule}: no functions/ route under it`,
     !existsSync(join(root, 'functions', top)) &&
     !existsSync(join(root, 'functions', top.replace(/\.[^.]+$/, '') + '.ts')));
}

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
