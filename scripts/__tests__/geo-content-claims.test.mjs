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
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

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
    `${name}: no hardcoded catalogue counts`,
    !/\b\d{2,3},?\d*\+\s*(events|restaurants|venues|playgrounds|attractions)/i.test(source),
    'useHomepageStats reads the real numbers; a hardcoded one drifts and contradicts',
  );
}

console.log(
  failures
    ? `\nFAIL: geo-content-claims — ${failures} failing check(s)\n`
    : '\nPASS: geo-content-claims — 0 failing check(s)\n',
);
process.exit(failures ? 1 : 0);
