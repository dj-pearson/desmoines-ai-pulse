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
  { component: 'EnhancedLocalSEO', mode: 'opt-in', enabledBy: 'faqData' },
  { component: 'FAQSchema', mode: 'always' },
];

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
  const offenders = [];
  let scanned = 0;
  let withFaq = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
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
