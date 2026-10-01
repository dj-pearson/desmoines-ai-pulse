#!/usr/bin/env node
/**
 * List the published writeups that contain claims nothing supplied
 * (WEB-BE-053 AC3).
 *
 * WHY THESE ROWS NEED LOOKING AT. Until 2026-09-19 the bulk-enhance-events
 * prompt instructed the model to "ADD STATISTICS: Include quantifiable data
 * (attendance, years running, venue capacity)" and to "INCLUDE
 * QUOTES/CITATIONS: Reference sources like 'According to Des Moines
 * Register...'" - with five fields as input, none of which contains a number,
 * a founding year or a quote. So the claims are not a model going off-piste;
 * they are the prompt being followed. Every row written under it may carry
 * attributed fabrications, on a public page, also fed into geo_key_facts and
 * geo_faq.
 *
 * WHAT THIS IS AND IS NOT. It flags TEXT PATTERNS, not falsehoods: it cannot
 * know whether a market really has 300 vendors. It narrows a few hundred rows
 * to the ones worth a human minute, ordered by how load-bearing the claim is.
 * Attribution is listed first because a quote attributed to a named
 * publication is the one that is both certainly invented and legally worst.
 *
 * REGENERATING: the prompt is fixed, so re-running bulk-enhance-events over a
 * flagged event replaces its writeup with a grounded one. This script does not
 * do that; it prints the ids so the owner can decide and so the count before
 * and after is a number rather than an impression.
 *
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/review-ai-writeups.mjs
 *   node scripts/review-ai-writeups.mjs --limit 200 --json
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LIMIT = Number(flag('--limit', '50'));
const AS_JSON = args.includes('--json');

const SELF_TEST = args.includes('--self-test');

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SELF_TEST) {
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY).\n' +
      'This script only reads; the anon key is enough if ai_writeup is publicly readable.',
  );
  process.exit(2);
  }
}

/**
 * Ordered by how certain the fabrication is, not by how often it occurs.
 * `severity` decides the report order; the label is what an owner reads.
 */
const RULES = [
  {
    id: 'attribution',
    severity: 1,
    label: 'attributed to a publication or a person',
    re: /\b(according to|as featured in|as reported by|told the|described by locals as)\b/i,
  },
  {
    id: 'quote',
    severity: 1,
    label: 'carries a quotation',
    // A quoted clause of at least four words followed by an attribution verb,
    // or preceded by one. Short quoted phrases (a venue's own name in quotes)
    // are not flagged.
    // \u201C\u201D are the curly quotes, written as escapes so this file stays ASCII.
    // They have to be matched: the model produces smart quotes, and a rule that
    // only knows the straight ones misses exactly the fabricated quotations it
    // exists to find.
    re: /["\u201C][^"\u201D]{15,}["\u201D]\s*,?\s*(notes|says|said|according|adds)|(?:notes|says|said|adds)\s*[,:]?\s*["\u201C][^"\u201D]{15,}["\u201D]/i,
  },
  {
    id: 'founding',
    severity: 2,
    label: 'claims a founding year or a run length',
    re: /\b(established in|founded in|since)\s+(18|19|20)\d{2}\b|\b\d+(st|nd|rd|th)\s+(annual|year)\b|\bfor over \d+ years\b/i,
  },
  {
    id: 'crowd',
    severity: 2,
    label: 'claims an attendance or capacity figure',
    re: /\b[\d,]{3,}\+?\s*(attendees|visitors|guests|people|fans|seats|vendors)\b|\bcapacity of\s+[\d,]+/i,
  },
  {
    id: 'superlative',
    severity: 3,
    label: 'claims a ranking or a superlative',
    // BOTH WORD ORDERS. The first version only matched "the largest market IN
    // IOWA" and the self-test caught it on the prompt's own example, which says
    // "this is IOWA'S largest and oldest farmers market" - the possessive comes
    // first and the rule read straight past it.
    re: new RegExp(
      [
        // "Iowa's largest ...", "Des Moines' only ..."
        String.raw`\b(iowa|des moines|central iowa|the midwest|the state)('s|s')?\s+(?:\w+\s+){0,3}(largest|oldest|biggest|best|first|only|premier)\b`,
        // "... the largest market in Iowa"
        String.raw`\b(largest|oldest|biggest|best|first|only|premier|number one)\b[^.]{0,40}\b(in|of)\s+(iowa|des moines|central iowa|the midwest|the state)\b`,
      ].join('|'),
      'i',
    ),
  },
];


/**
 * --self-test runs the rules against the paragraph the OLD prompt held up as a
 * model answer. It is the ideal fixture: six sentences containing five
 * distinct fabrications, none of them supported by the five fields the model
 * was given. A rule set that does not flag it cannot flag the rows it produced.
 *
 * Runs in `npm run validate`, so the rules are exercised without a database.
 */
if (SELF_TEST) {
  const OLD_EXAMPLE =
    'The Downtown Farmers Market returns every Saturday from 7 AM to 12 PM at Court Avenue (May through October). ' +
    'Established in 1975, this is Iowa\'s largest and oldest farmers market, attracting over 20,000 visitors weekly at peak season. ' +
    'According to Des Moines Tourism, the market features 300+ vendors selling local produce, artisan goods, and prepared foods. ' +
    '"It\'s become a Des Moines tradition and we could not be prouder," notes the market director. ' +
    'Located in the heart of downtown Des Moines, free parking is available in nearby ramps.';

  // A writeup built only from title, venue, date and a source description.
  const GROUNDED =
    'The Winter Market runs at Capital Square in downtown Des Moines on Saturday, December 6, starting at 9:00 AM. ' +
    'The market brings together local vendors selling handmade goods and food. ' +
    'Capital Square sits on Locust Street inside the skywalk system. ' +
    'Check the event listing for vendor details and hours.';

  const problems = [];
  for (const rule of RULES) {
    if (!rule.re.test(OLD_EXAMPLE)) {
      problems.push(`rule "${rule.id}" does not flag the prompt's own fabricated example`);
    }
    if (rule.re.test(GROUNDED)) {
      problems.push(`rule "${rule.id}" flags a writeup that invents nothing`);
    }
  }
  if (problems.length > 0) {
    console.error('[ai-writeup-review] the rules are not usable:\n');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `[ai-writeup-review] self-test: all ${RULES.length} rules flag the prompt's own fabricated example and none flag a grounded one.`,
  );
  process.exit(0);
}

async function fetchWriteups() {
  const params = new URLSearchParams({
    select: 'id,title,ai_writeup',
    ai_writeup: 'not.is.null',
    order: 'updated_at.desc',
    limit: String(LIMIT),
  });
  const res = await fetch(`${URL_}/rest/v1/events?${params}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostgREST ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function excerpt(text, re) {
  const m = text.match(re);
  if (!m) return '';
  const at = text.indexOf(m[0]);
  return text.slice(Math.max(0, at - 60), at + m[0].length + 60).replace(/\s+/g, ' ').trim();
}

const rows = await fetchWriteups();
const findings = [];
for (const row of rows) {
  const text = row.ai_writeup || '';
  const hits = RULES.filter((r) => r.re.test(text));
  if (hits.length === 0) continue;
  findings.push({
    id: row.id,
    title: row.title,
    severity: Math.min(...hits.map((h) => h.severity)),
    rules: hits.map((h) => h.id),
    excerpts: hits.map((h) => `${h.label}: ...${excerpt(text, h.re)}...`),
  });
}
findings.sort((a, b) => a.severity - b.severity);

if (AS_JSON) {
  console.log(JSON.stringify({ sampled: rows.length, flagged: findings.length, findings }, null, 2));
} else {
  console.log(`[ai-writeup-review] sampled ${rows.length} writeup(s); ${findings.length} carry a claim the prompt could not have supported.\n`);
  for (const f of findings) {
    console.log(`  ${f.id}  ${f.title}`);
    for (const e of f.excerpts) console.log(`      ${e}`);
    console.log('');
  }
  if (findings.length > 0) {
    console.log(
      'Each of these was produced by a prompt that asked for statistics and citations it had no source for.\n' +
        'Re-run bulk-enhance-events over these ids to replace them with grounded copy, then re-run this\n' +
        'script and record both counts.',
    );
  }
}
