/**
 * Checks for the edge-function deploy list (WEB-OPS-024).
 *
 *   node scripts/__tests__/list-edge-deploys.test.mjs
 *
 * The two cases that matter are the ones a naive `git diff --name-only` gets
 * wrong: _shared/ is bundled into every function at deploy time, so a change
 * there has to widen the blast radius even though no function directory
 * changed; and _shared / _tests / _typecheck are not deploy targets, so
 * emitting them makes `supabase functions deploy` fail on a name that is not a
 * function.
 */
const { classify } = await import('../list-edge-deploys.mjs');
const BS = String.fromCharCode(92);
let bad = 0;
const ck = (name, paths, expected) => {
  const got = classify(paths);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : '  got ' + JSON.stringify(got)));
  if (!ok) bad++;
};

ck('one function', ['supabase/functions/og-image/index.ts'], { functions: ['og-image'], sharedChanged: false });
ck('two functions, sorted', ['supabase/functions/b/i.ts', 'supabase/functions/a/i.ts'], { functions: ['a', 'b'], sharedChanged: false });
ck('same function twice dedupes', ['supabase/functions/a/i.ts', 'supabase/functions/a/x.ts'], { functions: ['a'], sharedChanged: false });
ck('_shared widens instead of deploying', ['supabase/functions/_shared/apiKeyAuth.ts'], { functions: [], sharedChanged: true });
ck('_tests is not a target', ['supabase/functions/_tests/x.ts'], { functions: [], sharedChanged: false });
ck('_typecheck is not a target', ['supabase/functions/_typecheck/x.ts'], { functions: [], sharedChanged: false });
ck('config.toml widens', ['supabase/config.toml'], { functions: [], sharedChanged: true });
ck('unrelated files ignored', ['src/App.tsx', 'README.md', 'supabase/migrations/x.sql'], { functions: [], sharedChanged: false });
ck('mixed change', ['supabase/functions/_shared/a.ts', 'supabase/functions/og-image/i.ts', 'src/x.ts'], { functions: ['og-image'], sharedChanged: true });
ck('windows separators', [['supabase', 'functions', 'og-image', 'index.ts'].join(BS)], { functions: ['og-image'], sharedChanged: false });
ck('function dir itself, no file', ['supabase/functions/og-image'], { functions: [], sharedChanged: false });
ck('empty input', [], { functions: [], sharedChanged: false });

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
