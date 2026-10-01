#!/usr/bin/env node
/**
 * An advertiser can cancel, pause and resume their own campaign - and cannot
 * give themselves days they did not pay for (WEB-ADS-011 AC2).
 *
 * WHY THE ARITHMETIC IS THE POINT. Pausing moves end_date, and end_date is how
 * many days somebody paid for. A browser that computed the new one could extend
 * a campaign for free by changing a number in a request, and RLS cannot tell an
 * invented end_date from a legitimate one - only whose row it is. CLAUDE.md
 * says money is decided on the server, and WEB-ADS-003 is what happens when it
 * is not: the summary said $70 and the stored row said $66.50 because two
 * formulas existed for one price.
 *
 * WHAT THIS CANNOT DO. No Postgres in this container, so the functions are not
 * executed - the rules are read out of the migration. check-migrations-parse
 * puts all of them through the real Postgres grammar, so the syntax is covered;
 * the behaviour needs the owner to apply them. Said plainly.
 */
import { readFileSync } from 'node:fs';

// SQL line comments start with `--`, and this migration's header explains the
// rules in prose. A check that matched the explanation would pass with the
// function bodies gutted.
const code = readFileSync('supabase/migrations/20260920000003_campaign_self_service.sql', 'utf8')
  .replace(/^\s*--[^\n]*$/gm, '');
const enumMigration = readFileSync('supabase/migrations/20260920000002_campaign_paused_status.sql', 'utf8')
  .replace(/^\s*--[^\n]*$/gm, '');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

/** The body of one plpgsql function. */
function body(fn) {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  if (start === -1) return '';
  const end = code.indexOf('\n$$;', start);
  return code.slice(start, end);
}

console.log('\nthe paused status ships before anything casts to it');
{
  check('the enum value is added', /ALTER TYPE public\.campaign_status ADD VALUE IF NOT EXISTS 'paused'/.test(enumMigration));
  // ALTER TYPE ... ADD VALUE commits before the label can be used, and the
  // Supabase CLI runs one migration per transaction. A function casting to
  // 'paused' in the SAME file would fail on a fresh database and work on one
  // where the value already existed - which is the worst kind of migration.
  check(
    'and nothing in that file uses it',
    !/'paused'::/.test(enumMigration) && !/= 'paused'/.test(enumMigration),
    'the cast must wait for the next migration',
  );
  check('the columns that make a resume honest are there', /days_remaining_at_pause integer/.test(enumMigration));
}

console.log('\npausing banks the days, resuming spends exactly those days');
{
  const fn = body('set_campaign_paused');
  check('set_campaign_paused exists', fn.length > 0);
  check(
    'pausing records what was left',
    /v_remaining := greatest\(0, \(c\.end_date::date - current_date\)\)/.test(fn),
    'the remaining count must be measured at the pause',
  );
  // Without greatest(0, ...) an overdue campaign banks negative days and comes
  // back with an end_date in the past.
  check('and cannot bank a negative', /greatest\(0,/.test(fn));
  check(
    'resuming spends exactly the banked days',
    /end_date = \(current_date \+ coalesce\(c\.days_remaining_at_pause, 0\)\)::date/.test(fn),
    'the new end_date must come from the banked count, not from the client',
  );
  // THE ASSERTION THAT PROTECTS THE MONEY: nothing about the new end_date may
  // come from the caller. The function takes a boolean and an id, and that is
  // the whole surface.
  check(
    'the function takes no date, no day count and no price',
    /set_campaign_paused\(\s*p_campaign_id uuid,\s*p_paused boolean\s*\)/.test(code),
    'a date parameter here is the client deciding what it paid for',
  );
  check('the bank is cleared on resume', /days_remaining_at_pause = NULL/.test(fn));
  check('only an active campaign pauses', /only an active campaign can be paused/.test(fn));
  check('only a paused campaign resumes', /only a paused campaign can be resumed/.test(fn));
}

console.log('\ncancelling is limited to the statuses where no money moved');
{
  const fn = body('cancel_campaign');
  check('cancel_campaign exists', fn.length > 0);
  check(
    'only draft and pending_payment',
    /c\.status NOT IN \('draft', 'pending_payment'\)/.test(fn),
    'a paid campaign cancelled with one click is a refund with no record of what was owed',
  );
  check('and it refuses rather than no-opping', /RAISE EXCEPTION 'cancel_campaign: a % campaign cannot be cancelled here'/.test(fn));
}

console.log('\na refund REQUEST is not a refund');
{
  const fn = body('request_campaign_refund');
  check('request_campaign_refund exists', fn.length > 0);
  check('it opens a ticket', /INSERT INTO public\.support_tickets/.test(fn));
  // If this ever calls the refund path, an advertiser refunds themselves.
  check(
    'it does not move any money',
    !/stripe/i.test(fn) && !/status = 'refunded'/.test(fn),
    'process-stripe-refund stays admin-only',
  );
  check('the ticket points back at the campaign', /source_ref = p_campaign_id::text/.test(fn) || /p_campaign_id::text,/.test(fn));
  // Pressing the button twice must not make two tickets a human reconciles.
  check('a second press returns the open ticket', /IF v_ticket_id IS NOT NULL THEN\s*RETURN v_ticket_id;/.test(fn));
  check('nothing unpaid can raise one', /c\.status IN \('draft', 'pending_payment', 'cancelled', 'refunded'\)/.test(fn));
}

console.log('\nauthorization: your own campaign, or an admin');
{
  for (const fn of ['cancel_campaign', 'set_campaign_paused', 'request_campaign_refund']) {
    const b = body(fn);
    check(
      `${fn} checks the owner`,
      /public\.is_admin\(\) OR \(auth\.uid\(\) IS NOT NULL AND auth\.uid\(\) = c\.user_id\)/.test(b),
      'an advertiser must not be able to pause somebody else\'s campaign',
    );
    check(`  and refuses out loud`, new RegExp(`RAISE EXCEPTION '${fn}: not authorized'`).test(b));
  }
  check('anon executes none of them', (code.match(/FROM anon;/g) || []).length === 3);
  check('and none is granted to PUBLIC', !/GRANT EXECUTE ON FUNCTION public\.(cancel_campaign|set_campaign_paused|request_campaign_refund)[^;]*TO PUBLIC/.test(code));
}

console.log('\nthe browser calls them and never computes the answer itself');
{
  const hook = readFileSync('src/hooks/useCampaigns.ts', 'utf8');
  check('the hook calls the functions', /'cancel_campaign'/.test(hook) && /'set_campaign_paused'/.test(hook) && /'request_campaign_refund'/.test(hook));
  check(
    'and never writes end_date or status itself',
    !/from\("campaigns"\)\s*\n?\s*\.update\(/.test(hook),
    'a client update here is the client deciding its own run length',
  );

  const dashboard = readFileSync('src/pages/CampaignDashboard.tsx', 'utf8');
  check('the dashboard offers cancel', /Cancel<\/Button>/.test(dashboard.replace(/\s+/g, ' ').replace(/> </g, '><')) || /cancelCampaign\(campaign\.id\)/.test(dashboard));
  check('pause and resume', /setCampaignPaused\(campaign\.id, true\)/.test(dashboard) && /setCampaignPaused\(campaign\.id, false\)/.test(dashboard));
  check('and a refund request', /requestRefund\(/.test(dashboard));
  // A server call that can refuse has to be able to say so. The version that
  // swallows the error leaves an advertiser pressing a dead button.
  check('a refusal reaches the advertiser', /toast\.error\(/.test(dashboard));
  // The status map moved to src/lib/campaignDisplay.ts (business plan WP0) so
  // the dashboard and the detail page cannot word a status differently.
  const display = readFileSync('src/lib/campaignDisplay.ts', 'utf8');
  check(
    'paused renders as a status rather than falling through',
    /paused: \{ label: "Paused", tone: "\w+" \}/.test(display) && /CAMPAIGN_STATUS\[campaign\.status\]/.test(dashboard),
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
