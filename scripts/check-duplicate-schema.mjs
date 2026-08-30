/**
 * WEB-SEO-008 guard: no page may emit more than one FAQPage JSON-LD block.
 *
 * Google Search Console reported `Duplicate field "FAQPage"` across 34 URLs.
 * The cause was pages rendering two components that each injected their own
 * FAQPage via Helmet — a page-level FAQSection plus an Enhanced*SEO wrapper
 * that also built one. It was fixed piecemeal (2c28084, 2026-06-26) by
 * stripping FAQPage from EnhancedAttractionSEO and EnhancedPlaygroundSEO and
 * passing showSchema={false} on FreeEvents and KidsEvents.
 *
 * Nothing prevents it recurring, and it is close to invisible in review: each
 * component looks correct on its own and the duplication only exists in the
 * composition. Hence this check.
 *
 * It is a static approximation, not a renderer. It resolves which
 * FAQPage-emitting components a page renders and whether each is emitting
 * unconditionally, conditionally on a prop, or disabled. Conditional emitters
 * are reported only when the page demonstrably supplies the enabling prop.
 *
 * Run by `npm run validate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SRC = path.resolve('src');

/**
 * Components that inject a FAQPage JSON-LD block.
 *
 *   always     — emits whenever the component renders.
 *   enabledBy  — emits only when this prop is present and not explicitly false.
 *   disabledBy — does not emit when this prop is passed as {false}.
 *
 * Deliberately NOT listed: PseoFaq. src/pseo/componentSpecs.ts describes it as
 * carrying "Schema.org FAQPage markup in head", but that is the design spec —
 * the implementation in src/pseo/components/sections/PseoFaq.tsx is a
 * presentational accordion that emits nothing. PseoPage.tsx owns the FAQPage
 * for pSEO routes. Verify against the component, not the spec, before adding
 * anything here.
 */
const EMITTERS = [
  { component: 'FAQSection', mode: 'default-on', disabledBy: 'showSchema' },
  { component: 'EnhancedEventSEO', mode: 'always' },
  // EnhancedLocalSEO is NOT here. SEO-003 removed its FAQPage block and left
  // faqData as a hint that the page has an FAQ; the prop still exists and
  // feeds nothing. Modelling it as an opt-in emitter made five pages look like
  // duplicates when each has exactly one. assertModelMatchesSource below now
  // fails if any component listed here stops emitting, so this cannot drift
  // silently again.
  { component: 'FAQSchema', mode: 'always' },
];

/**
 * Blanks comments so a component NAMED in prose is not counted as rendered.
 *
 * This is the bug that made the guard cry wolf. SEO-003 fixed the real
 * duplication and, in the same commit, explained the fix in a comment
 * containing the literal text <FAQSection> three times - so the scanner read
 * EnhancedLocalSEO.tsx as rendering three FAQPage blocks. EventsThisWeekend
 * had one mention and one real render and was reported as two.
 *
 * Replaced with spaces rather than removed, so every offset and line number in
 * a later match still points at the right place.
 */
function stripComments(source) {
  const blank = (m) => m.replace(new RegExp("[^\n]", "g"), " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/.*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

/**
 * Fails when a modelled emitter no longer emits (WEB-SEO-008 AC5).
 *
 * The EMITTERS table is a model of the implementation, and a model that drifts
 * is worse than no guard: this one reported seven duplications that did not
 * exist, which made `npm run validate` red for everyone and trained people to
 * ignore it. If a component here stops emitting FAQPage, say so loudly instead
 * of over-counting every page that renders it.
 */
function assertModelMatchesSource(files) {
  const stale = [];
  for (const emitter of EMITTERS) {
    const own = files.find((f) => f.endsWith(`${emitter.component}.tsx`));
    if (!own) continue;
    const src = stripComments(fs.readFileSync(own, 'utf8'));
    if (!/["']@type["']\s*:\s*["']FAQPage["']/.test(src)) {
      stale.push(`${emitter.component} is modelled as an FAQPage emitter but ${path.relative(process.cwd(), own)} emits none`);
    }
  }
  return stale;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Extract the JSX attribute text of every <Component ... /> or <Component ...> in src. */
function jsxUsages(source, component) {
  const usages = [];
  const open = new RegExp(`<${component}(\\s|/|>)`, 'g');
  let m;
  while ((m = open.exec(source))) {
    // Scan forward to the end of the opening tag, tracking brace depth so that
    // a ">" inside an expression like {a > b} does not terminate it early.
    let i = m.index + component.length + 1;
    let depth = 0;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    usages.push(source.slice(m.index, i + 1));
  }
  return usages;
}

/** Does this file render <Component>, and if so is its FAQPage active? */
function emitterState(source, emitter) {
  const usages = jsxUsages(source, emitter.component);
  if (usages.length === 0) return { rendered: false, active: 0 };

  let active = 0;
  for (const usage of usages) {
    if (emitter.mode === 'always') {
      active++;
    } else if (emitter.mode === 'default-on') {
      // Emits unless explicitly disabled.
      const disabled = new RegExp(`${emitter.disabledBy}\\s*=\\s*\\{\\s*false\\s*\\}`).test(usage);
      if (!disabled) active++;
    } else if (emitter.mode === 'opt-in') {
      // Emits only when the enabling prop is supplied.
      const enabled = new RegExp(`${emitter.enabledBy}\\s*=\\s*\\{`).test(usage);
      if (enabled) active++;
    }
  }
  return { rendered: true, active, count: usages.length };
}

function main() {
  const files = walk(SRC);
  const stale = assertModelMatchesSource(files);
  if (stale.length) {
    console.error('\n❌ The FAQPage emitter model has drifted from the source (WEB-SEO-008 AC5)\n');
    for (const s of stale) console.error(`  ${s}`);
    console.error('\nUpdate EMITTERS in this file. A stale model over-counts and makes the guard cry wolf.\n');
    process.exit(1);
  }
  const offenders = [];
  let scanned = 0;
  let withFaq = 0;

  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    // An inline FAQPage literal in the file itself counts as an emitter too.
    const inline = (source.match(/["']@type["']\s*:\s*["']FAQPage["']/g) || []).length;

    const active = [];
    // Only count an inline literal when the file is a page/section that renders
    // it, not when it is one of the emitter components we already model.
    const isEmitterComponent = EMITTERS.some((e) =>
      file.endsWith(`${e.component}.tsx`),
    );
    if (inline > 0 && !isEmitterComponent) {
      active.push({ name: `${path.basename(file)} (inline literal)`, n: inline });
    }

    for (const emitter of EMITTERS) {
      if (file.endsWith(`${emitter.component}.tsx`)) continue;
      const state = emitterState(source, emitter);
      if (state.active > 0) active.push({ name: emitter.component, n: state.active });
    }

    scanned++;
    const total = active.reduce((s, a) => s + a.n, 0);
    if (total > 0) withFaq++;
    if (total > 1) {
      offenders.push({ file: path.relative(process.cwd(), file), active, total });
    }
  }

  if (offenders.length) {
    console.error('\n❌ Duplicate FAQPage schema detected (WEB-SEO-008)\n');
    for (const o of offenders) {
      console.error(`  ${o.file} — ${o.total} FAQPage blocks:`);
      for (const a of o.active) console.error(`      ${a.name} x${a.n}`);
    }
    console.error(
      '\nA page may emit at most one FAQPage. Pass showSchema={false} to FAQSection,',
    );
    console.error('or drop faqData from the Enhanced*SEO wrapper — pick one owner per page.\n');
    process.exit(1);
  }

  console.log(
    `✅ FAQPage schema: ${scanned} components scanned, ${withFaq} emit FAQPage, 0 duplicates.`,
  );
}

main();
