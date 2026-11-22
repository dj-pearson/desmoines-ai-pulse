#!/usr/bin/env node
/**
 * WEB-SEC-081: the replay behind scripts/check-view-security-invoker.mjs.
 *
 * Each case is a list of migration files and the views that must come out as
 * offenders. The ones that matter most are the negative controls: the exact
 * shape of the eight views WEB-SEC-081 fixed (a plain CREATE OR REPLACE VIEW
 * with no option) must fail, and a fixed view that is later redefined without
 * the WITH clause must fail again, since CREATE OR REPLACE resets options.
 */
import { analyze, invokerOption, blankComments } from '../check-view-security-invoker.mjs';

const f = (name, text) => ({ name, text });

const CASES = [
  {
    name: 'plain CREATE OR REPLACE VIEW is flagged (the WEB-SEC-081 shape)',
    files: [f('1.sql', 'CREATE OR REPLACE VIEW public.agent_tasks_overdue AS\nSELECT t.* FROM public.agent_tasks t;')],
    offenders: ['public.agent_tasks_overdue'],
  },
  {
    name: 'bare name is public',
    files: [f('1.sql', 'CREATE VIEW v_x AS SELECT 1;')],
    offenders: ['public.v_x'],
  },
  {
    name: 'WITH (security_invoker = on) passes',
    files: [f('1.sql', 'CREATE VIEW public.v WITH (security_invoker = on) AS SELECT 1;')],
    offenders: [],
  },
  {
    name: 'WITH (security_invoker) bare boolean passes',
    files: [f('1.sql', 'CREATE VIEW public.v WITH (security_barrier, security_invoker) AS SELECT 1;')],
    offenders: [],
  },
  {
    name: 'a later ALTER VIEW SET fixes it',
    files: [
      f('1.sql', 'CREATE VIEW public.v AS SELECT 1;'),
      f('2.sql', 'ALTER VIEW public.v SET (security_invoker = on);'),
    ],
    offenders: [],
  },
  {
    name: 'ALTER VIEW IF EXISTS SET true fixes it',
    files: [f('1.sql', 'CREATE VIEW public.v AS SELECT 1;\nALTER VIEW IF EXISTS v SET (security_invoker = true);')],
    offenders: [],
  },
  {
    name: 'CREATE OR REPLACE after the fix turns it off again',
    files: [
      f('1.sql', 'CREATE VIEW public.v AS SELECT 1;'),
      f('2.sql', 'ALTER VIEW public.v SET (security_invoker = on);'),
      f('3.sql', 'CREATE OR REPLACE VIEW public.v AS SELECT 1, 2;'),
    ],
    offenders: ['public.v'],
  },
  {
    name: 'SET (security_invoker = off) and RESET turn it off',
    files: [
      f('1.sql', 'CREATE VIEW public.a WITH (security_invoker = on) AS SELECT 1;\nALTER VIEW public.a SET (security_invoker = off);'),
      f('2.sql', 'CREATE VIEW public.b WITH (security_invoker = on) AS SELECT 1;\nALTER VIEW public.b RESET (security_invoker);'),
    ],
    offenders: ['public.a', 'public.b'],
  },
  {
    name: 'DROP VIEW forgets it',
    files: [f('1.sql', 'CREATE VIEW public.a AS SELECT 1;\nCREATE VIEW public.b AS SELECT 1;\nDROP VIEW IF EXISTS public.a, b CASCADE;')],
    offenders: [],
  },
  {
    name: 'RENAME carries the state to the new name',
    files: [f('1.sql', 'CREATE VIEW public.a AS SELECT 1;\nALTER VIEW public.a RENAME TO b;')],
    offenders: ['public.b'],
  },
  {
    name: 'marker on the line above allows a definer view',
    files: [f('1.sql', '-- view-security-definer-ok: public count of open events, no row data\nCREATE VIEW public.v AS SELECT count(*) FROM events;')],
    offenders: [],
  },
  {
    name: 'marker with no reason does not count',
    files: [f('1.sql', '-- view-security-definer-ok:\nCREATE VIEW public.v AS SELECT 1;')],
    offenders: ['public.v'],
  },
  {
    name: 'marker two lines above does not count',
    files: [f('1.sql', '-- view-security-definer-ok: reason\n\nCREATE VIEW public.v AS SELECT 1;')],
    offenders: ['public.v'],
  },
  {
    name: 'marker does not carry over to a later CREATE OR REPLACE',
    files: [
      f('1.sql', '-- view-security-definer-ok: reason\nCREATE VIEW public.v AS SELECT 1;'),
      f('2.sql', 'CREATE OR REPLACE VIEW public.v AS SELECT 2;'),
    ],
    offenders: ['public.v'],
  },
  {
    name: 'commented-out CREATE VIEW is not a definition',
    files: [f('1.sql', '-- CREATE VIEW public.v AS SELECT 1;\n/* CREATE VIEW public.w AS SELECT 1; */')],
    offenders: [],
  },
  {
    name: 'materialized views and non-public schemas are skipped',
    files: [f('1.sql', 'CREATE MATERIALIZED VIEW public.m AS SELECT 1;\nCREATE VIEW private.p AS SELECT 1;')],
    offenders: [],
  },
  {
    name: 'a column list before WITH still parses',
    files: [f('1.sql', 'CREATE VIEW public.v (a, b) WITH (security_invoker = on) AS SELECT 1, 2;')],
    offenders: [],
  },
];

let failed = 0;
for (const c of CASES) {
  const got = analyze(c.files).offenders.map((o) => o.view).sort();
  const want = [...c.offenders].sort();
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : `\n      want ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
}

const UNITS = [
  ['invokerOption on', invokerOption('security_invoker = on') === true],
  ['invokerOption quoted false', invokerOption("security_invoker='false'") === false],
  ['invokerOption absent', invokerOption('security_barrier = true') === undefined],
  ["blankComments keeps '--' inside a string", blankComments("SELECT '--x'; CREATE VIEW v AS SELECT 1;").includes('CREATE VIEW')],
  ['blankComments keeps line count', blankComments('a\n-- b\n/* c\n d */\ne').split('\n').length === 5],
];
for (const [name, ok] of UNITS) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

const total = CASES.length + UNITS.length;
console.log(`\n${total - failed}/${total} passed.`);
process.exit(failed ? 1 : 0);
