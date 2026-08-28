#!/usr/bin/env node
/**
 * Offline checks for the PostgREST select parser (XPLAT-013 column checking).
 *
 *   npx tsx scripts/__tests__/mobile-select-columns.test.mjs
 *
 * The direction that matters is FALSE POSITIVES. This parser feeds a check that
 * fails a pull request, and it reads the two shipped mobile clients - so a
 * misparse does not produce a wrong number, it blocks a merge and sends someone
 * looking for a column that was never wrong.
 *
 * The first case below is not hypothetical. The naive parser reported
 * user_subscriptions.subscription_plans as a missing column on the first real
 * file it read, because it split on ':' and took the right-hand side of
 * "plan:subscription_plans(name)".
 */
import { parseSelect } from '../lib/mobileSelectColumns.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('embeds - the false positive that motivated this file');
{
  const r = parseSelect('status, platform, plan:subscription_plans(name)');
  check('the embed table is not read as a column', eq(r.columns, ['status', 'platform']), JSON.stringify(r.columns));
  check('the embed is captured with its own table', eq(r.embeds, [{ table: 'subscription_plans', columns: ['name'] }]), JSON.stringify(r.embeds));
}
{
  const r = parseSelect('subscription_plans(name, price)');
  check('an unaliased embed still resolves its table', r.embeds[0].table === 'subscription_plans');
  check('and keeps both of its columns', eq(r.embeds[0].columns, ['name', 'price']));
  check('contributes no columns to the outer table', eq(r.columns, []));
}
{
  // A comma inside the embed must not split the embed in half.
  const r = parseSelect('id, plan:plans(a, b, c), status');
  check('splits only at top level', eq(r.columns, ['id', 'status']), JSON.stringify(r.columns));
  check('embed keeps all three columns', eq(r.embeds[0].columns, ['a', 'b', 'c']));
}
{
  const r = parseSelect('id, other!fk_name(x)');
  check('a foreign-key hint is stripped from the table', r.embeds[0].table === 'other', r.embeds[0].table);
}
{
  const r = parseSelect('id, outer:a(inner:b(x), y)');
  check('a nested embed is hoisted so both tables get checked',
    r.embeds.map((e) => e.table).sort().join(',') === 'a,b',
    JSON.stringify(r.embeds));
}

{
  // The OTHER embed spelling, straight out of RatingsService.swift:29. The head
  // after the alias is a foreign-key COLUMN, not a table, and there is a space
  // before the paren. The parser reports the head as-is; deciding whether it is
  // a table or an FK column needs the schema, so check-mobile-schema-usage does
  // that and accepts a head that is a real column of the outer table.
  const r = parseSelect('*, profiles:user_id (first_name, last_name)');
  check('a space before the paren still parses as an embed', r.embeds.length === 1, JSON.stringify(r));
  check('the head is reported verbatim, not guessed at', r.embeds[0].table === 'user_id', r.embeds[0].table);
  check('its columns come through', eq(r.embeds[0].columns, ['first_name', 'last_name']));
  check('the leading star is still seen', r.star === true);
}

console.log('\nplain columns');
{
  const r = parseSelect('id, title, image_url');
  check('a simple list', eq(r.columns, ['id', 'title', 'image_url']));
  check('no embeds, no star', r.embeds.length === 0 && r.star === false);
}
{
  const r = parseSelect('renamed:actual_column');
  check('an alias resolves to the REAL column, not the alias', eq(r.columns, ['actual_column']), JSON.stringify(r.columns));
}
{
  const r = parseSelect('created_at::text');
  check('a cast keeps the left-hand column', eq(r.columns, ['created_at']), JSON.stringify(r.columns));
}
{
  const r = parseSelect('  id ,   title  ');
  check('whitespace is trimmed', eq(r.columns, ['id', 'title']));
}

console.log('\nstar, and things that must not become columns');
{
  const r = parseSelect('*');
  check('a bare star sets star and names no columns', r.star === true && eq(r.columns, []));
}
{
  const r = parseSelect('id, *');
  check('a star among columns still sets star', r.star === true && eq(r.columns, ['id']));
}
{
  const r = parseSelect('plan:plans(*)');
  check('a star inside an embed does not leak a column out', eq(r.columns, []) && eq(r.embeds[0].columns, []));
}
{
  // A json path or an aggregate is not a plain column; guessing at one would
  // report a missing column for something that is not a column at all.
  const r = parseSelect('id, metadata->>name, count()');
  check('json paths and calls are skipped, not guessed', eq(r.columns, ['id']), JSON.stringify(r.columns));
}
{
  const r = parseSelect('');
  check('an empty spec yields nothing', eq(r.columns, []) && r.embeds.length === 0 && r.star === false);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
