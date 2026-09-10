#!/usr/bin/env node
/**
 * WEB-QA-029. Event dates rendered in the READER's timezone.
 *
 * `events.date`, `event_start_utc` and `event_start_local` are all instants,
 * and `new Date(x).toLocaleDateString()` / `.toLocaleTimeString()` /
 * `.getDate()` format an instant in whatever timezone the browser is set to.
 * A 10pm Central show is 03:00Z the next day, so /music, /sports and the two
 * venue/team pages were showing an Eastern reader the wrong weekday and the
 * wrong day number, and every reader at or east of UTC the wrong date. This
 * site's entire premise is what is on in Des Moines; the answer must not
 * depend on where the reader is sitting.
 *
 * Use the helpers in src/lib/timezone.ts instead - formatEventDate,
 * formatEventDateShort, formatEventPart, formatEventTimeOnly,
 * formatInCentralTime, centralDayStartUtcISO, centralDayOfWeek.
 *
 * WHY A ZERO-TOLERANCE CHECK AND NOT A RATCHET. The reader-facing surfaces
 * are now clean, so the honest baseline is zero. Admin, CMS and CRM screens
 * are excluded: those are read by staff sitting in Des Moines looking at
 * record timestamps, where browser-local is the right answer.
 *
 * Usage: node scripts/check-event-time-tz.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const EXCLUDE = /(^|\/)(admin|cms|crm)\/|(Admin|Cms|Crm)[A-Z]|Admin\.tsx$|Manager\.tsx$|Dashboard\.tsx$|Wizard\.tsx$|ContentTable\.tsx$|Scraping|Competitor|EventDataEnhancer|SecurityMonitoring|SEOTools|DomainHighlight|GooglePlaces|WeekendGuide|ApiKeyManager|RecurringEventFields/;

// A date-bearing identifier immediately followed by a reader-timezone read.
const PATTERN =
  /new Date\(\s*[A-Za-z_$][\w$.?\[\]'"-]*\.(date|start_date|end_date|event_start_utc|event_start_local|instance_date)\b[^)]*\)\s*\.\s*(toLocaleDateString|toLocaleTimeString|toLocaleString|getDate|getDay|getMonth|getFullYear|getHours|getMinutes)\b/;

const files = execSync(
  "git ls-files 'src/**/*.ts' 'src/**/*.tsx'",
  { encoding: 'utf8' }
).split('\n').filter(Boolean).filter((f) => !EXCLUDE.test(f) && !f.includes('__tests__'));

const hits = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.trim();
    // Skip comment lines - this script's own docblock quotes the bad pattern.
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (PATTERN.test(code)) hits.push({ file, line: i + 1, text: code });
  });
}

if (hits.length === 0) {
  console.log('OK No reader-facing surface formats an event date in the browser timezone.');
  process.exit(0);
}

console.error('\nX Event dates formatted in the reader timezone:\n');
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}`);
  console.error(`    ${h.text.slice(0, 140)}`);
}
console.error(`
${hits.length} occurrence(s). events.date is an instant, so toLocale*/getDate
render it wherever the reader happens to be. A 10pm Central show is 03:00Z the
next day - an Eastern reader gets the wrong weekday and the wrong day number.

Use src/lib/timezone.ts: formatEventPart(event, 'EEEE'), formatEventTimeOnly(event)
(which also returns null for TBA events instead of printing the 19:31:58
sentinel as "7:31 PM"), formatEventDateShort(event), or formatInCentralTime.
`);
process.exit(1);
