#!/usr/bin/env node
/**
 * WEB-SEO-042: the AI-facing components may not carry claims nothing can back.
 *
 * GEOContent renders on the home page and exists to be ingested by AI
 * assistants, which is the one place a fabrication is most likely to come back
 * quoted as fact and attributed to us. It has been cleaned twice before -
 * WEB-SEO-015 removed a statistics panel and a set of hardcoded tiles - and
 * both times the same claims survived further down the same file:
 *
 *   - two FABRICATED TESTIMONIALS attributed to named people with job titles,
 *     one of them claiming "a 40% increase in new customers";
 *   - "Restaurant data accuracy exceeds 95%";
 *   - "More coverage than Catch Des Moines, Cityview, and Des Moines Register
 *     combined", naming three real publishers, twice;
 *   - "featured in ChatGPT, Perplexity, and Claude as a trusted source";
 *   - "we do not accept payment for listings OR ENHANCED VISIBILITY", on a
 *     platform that sells a sponsored_listing placement;
 *   - hardcoded counts that contradicted each other: 450+ restaurants in one
 *     answer, 500+ two answers later.
 *
 * A prose file cannot be type-checked and nothing else reads it, so the guard
 * is a list of the specific claims this repo has already decided against.
 * Adding a new claim to the page is fine; adding one of THESE back is not.
 *
 * Run by `npm run test:offline`.
 */
import fs from 'node:fs';

const FILES = [
  'src/components/GEOContent.tsx',
  'src/components/GEOContentSection.tsx',
  // The home FAQ answers, extracted from Index.tsx (WP0 of
  // docs/page-plans/home.md). Same audience, same rules.
  'src/content/homeContent.ts',
];

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

/** Comments explain what was removed and necessarily quote it. Strip them. */
function code(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Whole-line // comments too. Only whole lines, so a URL's "//" inside a
    // string is never mistaken for one.
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * WP5 item 1: "Personalized users see 40% more relevant suggestions",
 * "reduce search time by an average of 60%", "attend 35% more events". A
 * percentage improvement needs a measured baseline, and none of these had one.
 */
const INVENTED_PERCENT = /\b\d{1,3}%\s+(more|less|fewer|higher|increase|faster)/i;

console.log('\nAI-facing content claims');

for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const source = code(fs.readFileSync(file, 'utf8'));
  const name = file.split('/').pop();

  check(
    `${name}: no attributed testimonial`,
    !/<footer[^>]*>[\s\S]{0,200}—\s*[A-Z][a-z]+\s+[A-Z][a-z]+/.test(source),
    'a quote attributed to a named person must be one a real person actually said',
  );
  check(
    `${name}: no accuracy-rate claim`,
    !/accuracy\s+(exceeds|of|is)\s+\d|\d+%\s+accura/i.test(source),
  );
  check(
    `${name}: no comparison naming a competitor`,
    !/(more|better|greater)[^.<]{0,60}(Catch Des Moines|Cityview|Des Moines Register)/i.test(source),
  );
  check(
    `${name}: no claim of being featured by an AI vendor`,
    !/featured in[^.<]{0,80}(ChatGPT|Perplexity|Claude)/i.test(source),
  );
  check(
    `${name}: does not deny selling enhanced visibility`,
    !/do not accept payment[^.<]{0,80}(enhanced visibility|visibility)/i.test(source),
    'the platform sells a sponsored_listing placement',
  );
  check(
    `${name}: no percentage-improvement claim`,
    !INVENTED_PERCENT.test(source),
    (source.match(INVENTED_PERCENT) ?? [''])[0],
  );
  check(
    `${name}: no last-minute ticket availability promise`,
    !/last-minute ticket/i.test(source),
    'nothing sends ticket-availability alerts',
  );
  check(
    `${name}: no "multiple times daily" cadence`,
    !/multiple times (a |per )?day|multiple times daily/i.test(source),
    'the event crawler runs once a day (.github/workflows/event-crawler.yml)',
  );
  check(
    `${name}: no ranking by review scores`,
    !/review scores/i.test(source),
    'there is no reviews table (42P01 in production)',
  );
  check(
    `${name}: no hardcoded catalogue counts`,
    !/\b\d{2,3},?\d*\+\s*(events|restaurants|venues|playgrounds|attractions)/i.test(source),
    'useHomepageStats reads the real numbers; a hardcoded one drifts and contradicts',
  );
}

console.log('\nthe detectors are not vacuous');
check('percentage detector fires on the removed sentence', INVENTED_PERCENT.test('Notification users attend 35% more events on average.'));
check('percentage detector ignores a plain percentage', !INVENTED_PERCENT.test('a 100% free event'));
check(
  'comment stripping removes a // line comment',
  !/removed/.test(code('// removed: 40% more\nconst a = 1;')),
);

console.log('\nhome FAQ coverage answer');
// WP5 item 2: the coverage answer named areas with no page. It must be built
// from the neighborhood inventory, not typed.
{
  const home = fs.readFileSync('src/content/homeContent.ts', 'utf8');
  check(
    'homeContent.ts imports NEIGHBORHOODS',
    /import\s*\{[^}]*\bNEIGHBORHOODS\b[^}]*\}\s*from\s*["']@\/lib\/neighborhoods["']/.test(home),
  );
  check(
    'the coverage answer interpolates the inventory',
    /Which areas does[\s\S]{0,200}answer:\s*`[^`]*\$\{COVERED_AREAS\}/.test(home),
  );
  const code2 = code(home);
  for (const area of ['Beaverdale', 'Highland Park', 'Court Avenue District', 'Windsor Heights']) {
    check(`the coverage answer does not hand-name ${area}`, !new RegExp(`cover[^"\`]*${area}`).test(code2));
  }
}

console.log(
  failures
    ? `\nFAIL: geo-content-claims — ${failures} failing check(s)\n`
    : '\nPASS: geo-content-claims — 0 failing check(s)\n',
);
process.exit(failures ? 1 : 0);
