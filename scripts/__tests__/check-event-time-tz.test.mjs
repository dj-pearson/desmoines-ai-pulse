#!/usr/bin/env node
/**
 * WEB-QA-029: the line matcher behind scripts/check-event-time-tz.mjs.
 *
 * The check only ever matched new Date(x.date).toLocale*() / .get*(), so
 * FavoritesView's date-fns format(new Date(event.date), "MMM d, yyyy") passed
 * it while printing the next day for readers east of Central. These fixtures
 * pin both shapes, and the Central-safe helpers that must not trip it.
 */
import { isReaderTzLine } from '../check-event-time-tz.mjs';

const SHOULD_HIT = [
  `<span>{new Date(event.date).toLocaleDateString()}</span>`,
  `const d = new Date(e.event_start_utc).getDate();`,
  `<span>{format(new Date(event.date), "MMM d, yyyy")}</span>`,
  `{event.date ? format(new Date(event.date), "PPP") : "Not specified"}`,
  `const label = format(parseISO(row.event_start_local), 'EEE');`,
];

const SHOULD_PASS = [
  `<span>{formatEventPart(event, "MMM d, yyyy")}</span>`,
  `formatInTimeZone(new Date(event.date), CENTRAL_TIMEZONE, "MMM d")`,
  `formatInCentralTime(event.event_start_utc, "h:mm a")`,
  `format(new Date(), "yyyy-MM-dd")`,
  `// format(new Date(event.date), "MMM d") is the bug`,
  `const t = new Date(event.date).getTime();`,
];

let failed = 0;
for (const line of SHOULD_HIT) {
  const ok = isReaderTzLine(line);
  console.log(`${ok ? 'PASS' : 'FAIL'}  flags: ${line}`);
  if (!ok) failed++;
}
for (const line of SHOULD_PASS) {
  const ok = !isReaderTzLine(line);
  console.log(`${ok ? 'PASS' : 'FAIL'}  allows: ${line}`);
  if (!ok) failed++;
}

const total = SHOULD_HIT.length + SHOULD_PASS.length;
console.log(`\n${total - failed}/${total} passed.`);
process.exit(failed ? 1 : 0);
