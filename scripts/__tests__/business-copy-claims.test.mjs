#!/usr/bin/env node
/**
 * The business pages may not claim what nothing measures.
 * docs/page-plans/business.md WP5 item 3.
 *
 * /advertise, /campaigns/*, /business, /business-partnership and /submit-event
 * are where a Des Moines business decides whether to pay us or send us its
 * events. The audits found the same kinds of sentence on all of them, none
 * backed by a query:
 *
 *   - audience sizes: "thousands of locals", "50K+ monthly visitors";
 *   - rates: "3.2% CTR", "40% more foot traffic";
 *   - service promises nobody staffs: "reviewed within 24 hours",
 *     "approved within 1-2 business days", "updated every hour";
 *   - a 555- phone number, which is a placeholder shown as a real line.
 *
 * Numbers that are measured come from the database at render time, so they
 * never appear as literals in these files. A literal that matches the pattern
 * below is therefore either invented or a layout value, and the allowlist
 * covers the layout values.
 *
 * Run by `npm run test:offline` (scripts/run-offline-suites.mjs discovers it).
 */
import fs from 'node:fs';
import path from 'node:path';

const BANNED =
  /\b(thousands|hundreds)\b|\d+K\+|\d+%|555-\d{4}|within \d+(-\d+)? (hours|business days)|every hour/i;

/**
 * Matches that are not claims. A banned match is let through only when one of
 * these matches a span of the same line that contains it.
 *
 *  - a percentage used as a size in a prop or a class: width="100%",
 *    height={"100%"}, w-[50%], translate-x-[-50%];
 *  - a measured window label: "last 30 days", "past 7 days". The window is a
 *    query bound the page states, not a result it asserts.
 */
const ALLOWED_LINE = [
  /\b(width|height|size|minWidth|maxWidth|minHeight|maxHeight|top|left|right|bottom|x|y|cx|cy|r|innerRadius|outerRadius|offset)\s*[=:]\s*\{?\s*["'`]-?\d+%["'`]/,
  /[\w-]+-\[-?\d+%\]/,
  /\b(last|past)\s+\d+\s+(days|weeks|months)\b/i,
];

/** Page files named in the plan. Each must exist, so a rename fails loudly. */
const PAGE_DIR = 'src/pages';
const PAGE_PATTERN = /^(Advertise.*|Campaign.*|UploadCreatives|Business.*|SubmitEvent|TeamManagement)\.tsx$/;
const REQUIRED = [
  'src/pages/Advertise.tsx',
  'src/pages/AdvertiseSuccess.tsx',
  'src/pages/AdvertiseCancel.tsx',
  'src/pages/CampaignDashboard.tsx',
  'src/pages/CampaignDetail.tsx',
  'src/pages/CampaignAnalytics.tsx',
  'src/pages/UploadCreatives.tsx',
  'src/pages/TeamManagement.tsx',
  'src/pages/BusinessHub.tsx',
  'src/pages/BusinessPartnership.tsx',
  'src/pages/SubmitEvent.tsx',
  'src/lib/placementSpecs.ts',
];

/**
 * Components those pages render and the business plan owns. Checked when
 * present; some are created by other packages of the same plan.
 * CreativeUploadForm.tsx is Home's file and carries a hand-off (business.md,
 * "Hand-offs"), so it is not gated here.
 */
const OPTIONAL = [
  'src/lib/businessCopy.ts',
  'src/components/advertising/AdvertiseSummaryBar.tsx',
  'src/components/advertising/PlacementRow.tsx',
  'src/components/advertising/PlatformMetrics.tsx',
  'src/components/advertising/ListingPicker.tsx',
  'src/components/business/BusinessLayout.tsx',
  'src/components/business/ClaimedListingEditForm.tsx',
  'src/components/business/PartnershipInquiryForm.tsx',
  'src/components/business/YourEvents.tsx',
  'src/components/business/YourListings.tsx',
  'src/components/campaigns/ConfirmCampaignAction.tsx',
  'src/components/campaigns/PayCampaignButton.tsx',
  'src/components/campaigns/WhatWeCount.tsx',
  'src/components/BusinessDashboard.tsx',
  'src/components/BusinessPartnershipApplication.tsx',
];

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail.split('\n').join('\n        ')}` : ''}`);
  }
};

/**
 * Comments explain what was removed and often quote it. Blank them out but
 * keep the newlines, so reported line numbers match the file.
 */
function stripComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    // Whole-line // comments only, so the "//" in a URL string is never one.
    .replace(/^\s*\/\/.*$/gm, blank);
}

/** Every banned match in `source`, minus the allowlisted ones. */
function offending(source) {
  const hits = [];
  const lines = stripComments(source).split('\n');
  lines.forEach((line, i) => {
    const global = new RegExp(BANNED.source, 'gi');
    for (const m of line.matchAll(global)) {
      const start = m.index;
      const end = start + m[0].length;
      // Allowed only when an allowlisted span covers this match, so "last 30
      // days" on a line does not excuse a "50K+" beside it.
      const covered = ALLOWED_LINE.some((re) =>
        [...line.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].some(
          (a) => a.index <= start && a.index + a[0].length >= end,
        ),
      );
      if (covered) continue;
      hits.push({ line: i + 1, text: m[0], context: line.trim().slice(0, 140) });
    }
  });
  return hits;
}

// The pattern itself, so a loosened regex or allowlist fails here first.
console.log('\nBusiness copy claims: the pattern');
const MUST_CATCH = [
  'Reach thousands of Des Moines locals',
  'Seen by hundreds of businesses',
  '50K+ monthly visitors',
  'Average 3.2% click-through rate',
  'Call (515) 555-0123',
  'We review every submission within 24 hours',
  'Creatives are approved within 1-2 business days',
  'Listings refresh every hour',
];
const MUST_PASS = [
  '<ResponsiveContainer width="100%" height={180}>',
  '<div className="w-[50%] translate-x-[-50%]">',
  'Impressions, last 30 days',
  'Clicks in the past 7 days',
  'Most submissions are checked automatically within a few minutes',
];
// An allowed phrase must not excuse a claim next to it on the same line.
MUST_CATCH.push('Impressions, last 30 days, from 50K+ visitors');
for (const s of MUST_CATCH) check(`catches "${s}"`, offending(s).length > 0);
for (const s of MUST_PASS) check(`allows "${s}"`, offending(s).length === 0, JSON.stringify(offending(s)));

console.log('\nBusiness copy claims: the files');

const pageFiles = fs.existsSync(PAGE_DIR)
  ? fs.readdirSync(PAGE_DIR).filter((f) => PAGE_PATTERN.test(f)).map((f) => path.posix.join(PAGE_DIR, f))
  : [];

for (const file of REQUIRED) check(`${file} exists`, fs.existsSync(file), 'renamed or moved? update this list');

const files = [...new Set([...REQUIRED, ...pageFiles, ...OPTIONAL])].filter((f) => fs.existsSync(f)).sort();

for (const file of files) {
  const hits = offending(fs.readFileSync(file, 'utf8'));
  check(
    `${file}: no unmeasured audience, rate or turnaround claim`,
    hits.length === 0,
    hits.map((h) => `${file}:${h.line}  "${h.text}"  in: ${h.context}`).join('\n'),
  );
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
if (failures) {
  console.log(
    '\nA number on these pages has to come from a query at render time. If the\n' +
      'match is a layout value or a stated query window, extend ALLOWED_LINE in\n' +
      'scripts/__tests__/business-copy-claims.test.mjs instead of rewording it away.',
  );
}
process.exit(failures ? 1 : 0);
