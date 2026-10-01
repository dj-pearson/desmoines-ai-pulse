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

/**
 * Home pass-2 WP4 item 1. The FAQ said sponsored placements "do not change the
 * ordinary listings around them" and that nobody can pay "to rank higher in
 * the ordinary listings", while arrangeSponsored (src/lib/sponsored.ts) lifts
 * up to two paid rows to the top of the events, restaurants and attractions
 * lists. Either sentence is a denial of what the code does.
 */
const DENIES_PAID_ORDER =
  /(do(?:es)? not|don't|never) change the ordinary listings|rank higher in the ordinary listings/i;

/**
 * Home pass-2 WP4 item 4. The WebSite and WebPage nodes described the site
 * with BRAND.description: "real-time updates, personalized recommendations".
 * Events are crawled once a day and anonymous visitors get no personalisation.
 */
const UNBACKED_HOME_DESCRIPTION = /real-time|personali[sz]ed recommendations/i;

/** The old FAQ answer, verbatim, so the detector is proven against it. */
const OLD_PAID_ANSWER =
  'Listing an event or a restaurant is free, and we do not charge to be included or to rank higher in the ordinary listings. We do sell advertising, including sponsored placements; those are paid, they are labelled where they appear, and they do not change the ordinary listings around them.';

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
    `${name}: does not deny that sponsored listings are moved up`,
    !DENIES_PAID_ORDER.test(source),
    (source.match(DENIES_PAID_ORDER) ?? [''])[0],
  );
  if (file === 'src/content/homeContent.ts') {
    // The whole file, comments included: this is also the acceptance check
    // `rg -n "real-time|personalized recommendations" src/content/homeContent.ts`.
    const raw = fs.readFileSync(file, 'utf8');
    check(
      `${name}: no "real-time" or "personalized recommendations"`,
      !UNBACKED_HOME_DESCRIPTION.test(raw),
      (raw.match(UNBACKED_HOME_DESCRIPTION) ?? [''])[0],
    );
  }
  check(
    `${name}: no hardcoded catalogue counts`,
    !/\b\d{2,3},?\d*\+\s*(events|restaurants|venues|playgrounds|attractions)/i.test(source),
    'useHomepageStats reads the real numbers; a hardcoded one drifts and contradicts',
  );
}

console.log('\nthe detectors are not vacuous');
check('percentage detector fires on the removed sentence', INVENTED_PERCENT.test('Notification users attend 35% more events on average.'));
check('percentage detector ignores a plain percentage', !INVENTED_PERCENT.test('a 100% free event'));
check('paid-order detector fires on the old FAQ answer', DENIES_PAID_ORDER.test(OLD_PAID_ANSWER));
check(
  'paid-order detector passes the current answer',
  !DENIES_PAID_ORDER.test(
    'A sponsored listing can appear first on the events, restaurants and attractions pages, at most two per list, and each one carries a Sponsored label. Nothing else is reordered for money.',
  ),
);
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

console.log('\nhome FAQ single sources');
// WP4 item 7: the cadence sentence lives once, in eventsCopy.ts; the paid
// answer lives once, in homeContent.ts, and GEOContent renders the same one.
{
  const home = fs.readFileSync('src/content/homeContent.ts', 'utf8');
  const geo = fs.readFileSync('src/components/GEOContent.tsx', 'utf8');
  check(
    'homeContent.ts answers the cadence question with EVENTS_UPDATE_ANSWER',
    /How often are the listings updated\?[\s\S]{0,600}answer:\s*EVENTS_UPDATE_ANSWER/.test(home),
  );
  check('GEOContent renders EVENTS_UPDATE_ANSWER', /\{EVENTS_UPDATE_ANSWER\}/.test(geo));
  check('GEOContent renders HOME_PAID_PLACEMENT_ANSWER', /\{HOME_PAID_PLACEMENT_ANSWER\}/.test(geo));
  check(
    'the paid answer links /advertise',
    /answer:\s*HOME_PAID_PLACEMENT_ANSWER,\s*links:\s*\[\{[^}]*to:\s*"\/advertise"/.test(home),
  );
  check('the today answer does not claim a category filter', !/today listing[^"]*filterable by category/.test(code(home)));
}

console.log(
  failures
    ? `\nFAIL: geo-content-claims — ${failures} failing check(s)\n`
    : '\nPASS: geo-content-claims — 0 failing check(s)\n',
);
process.exit(failures ? 1 : 0);
