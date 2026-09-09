#!/usr/bin/env node
/**
 * WEB-ADS-008: the approval email must not claim the event is live.
 *
 * Approving a submission sets user_submitted_events.status and nothing copies
 * the row into `events` - the admin queue has no publish path at all, and the
 * AI path maps only a subset of fields when it does copy. The email said
 * "approved and is now live on Des Moines Insider", so the one message an
 * organizer receives sent them to look at a listing that is not there, and
 * whoever went looking had every reason to think the site was broken.
 *
 * This checks COPY, which is the thing nothing else in this repo checks. It
 * lives here rather than in supabase/functions/_tests/ so it runs under
 * `npm run test:offline` (node, no Deno needed) in CI and locally.
 *
 * When publish_submission exists and the approve path calls it, a liveness
 * claim becomes true and this check should be updated in the same commit.
 */
import fs from 'node:fs';

const FN = 'supabase/functions/notify-event-submission/index.ts';
const source = fs.readFileSync(FN, 'utf8');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

console.log('\nsubmitter email claims');

const start = source.indexOf('case "event_approved"');
const end = source.indexOf('case "event_rejected"');
check('the event_approved case exists', start !== -1 && end > start);

const approvedCase = source.slice(start, end);
// Only the message strings, not the comment that explains them - the comment
// necessarily quotes the old wording.
const messages = [...approvedCase.matchAll(/message:\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);
check('it builds a message', messages.length > 0);

for (const message of messages) {
  check(
    'the approval email makes no liveness claim',
    !/\bis now live\b|\bis live\b|\bnow live\b|\bpublished\b/i.test(message),
    message,
  );
  check('it still says the submission was approved', /approved/i.test(message), message);
}

// The other half of the same promise: EventSubmissionForm tells organizers
// they will be emailed. If that sentence goes away, this whole check is moot;
// if it stays, both decision paths have to keep it.
const form = fs.readFileSync('src/components/EventSubmissionForm.tsx', 'utf8');
check(
  'the form still promises an email, which is why the admin path sends one',
  /email you when your event is approved/i.test(form),
);

console.log(
  failures
    ? `\nFAIL: submission-email-claims — ${failures} failing check(s)\n`
    : '\nPASS: submission-email-claims — 0 failing check(s)\n',
);
process.exit(failures ? 1 : 0);
