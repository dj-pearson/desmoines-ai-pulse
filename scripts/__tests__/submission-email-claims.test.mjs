#!/usr/bin/env node
/**
 * WEB-ADS-008: the approval email may claim the event is live only when it is.
 *
 * WHAT THIS ORIGINALLY CAUGHT. Approving a submission set
 * user_submitted_events.status and nothing copied the row into `events` - the
 * admin queue had no publish path at all, and the AI path mapped only a subset
 * of fields when it did copy. The email said "approved and is now live on Des
 * Moines Insider", so the one message an organizer receives sent them to look
 * at a listing that was not there, and whoever went looking had every reason
 * to think the site was broken. The wording was changed to promise nothing
 * about liveness, and this file was left saying: restore the claim in the same
 * commit that makes it true.
 *
 * THAT COMMIT IS NOW IN. publish_submission (20260920000001) publishes, both
 * approve paths call it, and the email resolves the listing from
 * events.submission_id. So the claim is back - CONDITIONALLY, which is the
 * whole difference. The old sentence was unconditional, which is why it was
 * wrong every single time. The assertions below pin the condition, not the
 * wording: a liveness claim may appear only on the branch that HAS a resolved
 * URL, and the fallback branch must still promise nothing.
 *
 * This checks COPY, which is the thing nothing else in this repo checks. It
 * lives here rather than in supabase/functions/_tests/ so it runs under
 * `npm run test:offline` (node, no Deno needed) in CI and locally.
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

// COMMENTS STRIPPED. The comments in this branch necessarily quote the old
// wording to explain it, and a check that fires on the sentence explaining a
// bug is measuring the explanation.
const approvedCase = source
  .slice(start, end)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(?<!:)\/\/.*$/, ''))
  .join('\n');

// The claim is only allowed to exist because of this lookup.
check(
  'the live URL is resolved from the published events row',
  /\.eq\("submission_id", eventId\)/.test(approvedCase),
  'nothing resolves the listing, so no branch may claim it is live',
);
check(
  'and the URL points at that row',
  /liveUrl = `\$\{siteUrl\}\/events\/\$\{publishedEvent\.id\}`/.test(approvedCase),
);

// Only the strings inside the buildSubmitterEmail call. Two traps here, both
// hit while writing this: [^"] matches newlines, so a loose pattern spans from
// one string's closing quote to the next one's opening quote and calls the code
// between them a "message"; and the branch also contains
// console.error("[notify-event-submission] published lookup failed:"), whose
// word "published" reads as a liveness claim.
const emailCall = approvedCase.slice(approvedCase.indexOf('buildSubmitterEmail({'));
const messages = [...emailCall.matchAll(/"([^"\n]{30,})"/g)].map((m) => m[1]);
check('it builds both messages', messages.length === 2, JSON.stringify(messages));

const LIVENESS = /\bis now live\b|\bis live\b|\bnow live\b|\bpublished\b/i;
const claiming = messages.filter((m) => LIVENESS.test(m));

check('exactly one message claims liveness', claiming.length === 1, JSON.stringify(claiming));
check(
  'and the other one still promises nothing about when it appears',
  messages.filter((m) => !LIVENESS.test(m)).length === 1,
);
for (const message of messages) {
  check('every branch still says the submission was approved', /approved/i.test(message), message);
}

// THE ASSERTION THAT MATTERS: the claim hangs off the resolved URL. An
// unconditional message string here is the original bug, restored.
check(
  'the message is chosen by whether a listing was found',
  /message:\s*liveUrl\s*\n?\s*\?/.test(approvedCase),
  'the liveness claim must be on the liveUrl branch, not unconditional',
);
check(
  'and the button goes to that listing',
  /liveUrl,/.test(approvedCase),
);

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
