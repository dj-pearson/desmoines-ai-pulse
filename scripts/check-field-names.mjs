#!/usr/bin/env node
/**
 * WEB-UX-068. A text field or select with no accessible name.
 *
 * An <Input placeholder="your@email.com" /> looks labelled, but a placeholder
 * is not a name: it disappears the moment the reader types, many screen
 * readers skip it, and voice control ("click email") has nothing to target.
 * WEB-UX-053, 058, 063, 064 and 065 each fixed a handful of these by hand,
 * one screen at a time, and nothing stopped the next one being written.
 *
 * WHAT COUNTS AS NAMED. An <Input>, <Textarea>, <input>, <textarea>, <select>
 * or <SelectTrigger> is named when any of these hold:
 *   - it has aria-label, aria-labelledby or title
 *   - it sits inside a <label>/<Label> element
 *   - it sits inside <FormControl>, which ties it to the FormItem's FormLabel
 *   - its id is a string literal that some <Label htmlFor> in the same file
 *     names, or its id is an expression ({fieldId}, {`${prefix}-x`}) - the
 *     label may live in a parent component, so an expression gets the benefit
 *     of the doubt
 *   - it has a {...spread} (the name may arrive in the props)
 * type="hidden", "file", "checkbox", "radio", "submit" and "button" inputs
 * are skipped: they are hidden, or named by their own label/button rules.
 * The count is a floor, never a false alarm.
 *
 * SO THIS IS A RATCHET. A file may lose unnamed fields freely. It may not gain
 * one, and a file with none may not acquire its first. src/components/ui is
 * excluded: those are the shadcn primitives, whose names come from the caller.
 *
 * Offline. Parses with the TypeScript compiler.
 *
 *   node scripts/check-field-names.mjs           # check
 *   node scripts/check-field-names.mjs --list    # print every offender
 *   node scripts/check-field-names.mjs --write   # re-baseline (only ever downward)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src/components', 'src/pages'].map((p) => join(ROOT, p));
const BASELINE = join(ROOT, '.github', 'field-names-baseline.json');
const WRITE = process.argv.includes('--write');
const LIST = process.argv.includes('--list');

const EXCLUDE = /[\\/]components[\\/]ui[\\/]|__tests__|\.test\.tsx$/;
const FIELD_TAGS = new Set(['Input', 'Textarea', 'input', 'textarea', 'select', 'SelectTrigger']);
const NAME_ATTRS = new Set(['aria-label', 'aria-labelledby', 'title']);
const SKIP_TYPES = new Set(['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image']);
const LABEL_TAGS = new Set(['label', 'Label', 'FormControl']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx') && !EXCLUDE.test(full)) out.push(full);
  }
  return out;
}

/** A string literal attribute value, or null when it is an expression. */
function literalValue(init) {
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return null;
}

function readAttrs(opening) {
  const attrs = new Map();
  let spread = false;
  for (const p of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(p)) spread = true;
    else attrs.set(p.name.getText(), p.initializer);
  }
  return { attrs, spread };
}

function insideLabel(node) {
  for (let a = node.parent; a; a = a.parent) {
    if (ts.isJsxElement(a) && LABEL_TAGS.has(a.openingElement.tagName.getText())) return true;
  }
  return false;
}

/** Offending fields in one file, as 1-based line numbers. */
export function findUnnamedFields(source, fileName = 'file.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const htmlFor = new Set();
  const candidates = [];
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText();
      const { attrs, spread } = readAttrs(node);
      if ((tag === 'label' || tag === 'Label') && attrs.has('htmlFor')) {
        const v = literalValue(attrs.get('htmlFor'));
        htmlFor.add(v ?? attrs.get('htmlFor').getText());
      }
      if (FIELD_TAGS.has(tag)) {
        const type = attrs.has('type') ? literalValue(attrs.get('type')) : null;
        const named =
          spread ||
          (type !== null && SKIP_TYPES.has(type)) ||
          [...NAME_ATTRS].some((n) => attrs.has(n)) ||
          insideLabel(node);
        if (!named) {
          const idInit = attrs.get('id');
          const idLiteral = idInit ? literalValue(idInit) : null;
          // An expression id may be labelled from a parent; benefit of the doubt.
          if (!idInit || idLiteral !== null) {
            candidates.push({
              id: idLiteral,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return candidates.filter((c) => c.id === null || !htmlFor.has(c.id)).map((c) => c.line);
}

function scan() {
  const files = {};
  for (const dir of ROOTS) {
    for (const full of walk(dir)) {
      const lines = findUnnamedFields(readFileSync(full, 'utf8'), full);
      if (lines.length > 0) files[relative(ROOT, full).split('\\').join('/')] = lines;
    }
  }
  return files;
}

function main() {
  const found = scan();
  const counts = Object.fromEntries(
    Object.entries(found).sort(([a], [b]) => a.localeCompare(b)).map(([f, l]) => [f, l.length]),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (LIST) {
    for (const [file, lines] of Object.entries(found)) {
      for (const line of lines) console.log(`${file}:${line}`);
    }
  }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

  if (WRITE) {
    if (baseline && total > baseline.total) {
      console.error(`[field-names] refusing to raise the baseline from ${baseline.total} to ${total}.`);
      process.exit(1);
    }
    const out = {
      _comment:
        'Text fields and selects with no accessible name (placeholder only, or nothing), per file (WEB-UX-068). This list must only ever SHRINK - add a <Label htmlFor> tied by useId, or aria-label when the design has no room for visible text.',
      generated: new Date().toISOString().slice(0, 10),
      total,
      files: counts,
    };
    writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
    console.log(`[field-names] baseline written: ${total} in ${Object.keys(counts).length} files.`);
    return;
  }

  if (!baseline) {
    console.error('[field-names] no baseline; run with --write.');
    process.exit(1);
  }

  const grew = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline.files[file] ?? 0;
    if (n > allowed) grew.push({ file, n, allowed, lines: found[file] });
  }

  if (grew.length > 0) {
    console.error(`\n[field-names] ${grew.length} file(s) gained a field with no accessible name:\n`);
    for (const g of grew) {
      console.error(`  ${g.file}: ${g.n} (baseline ${g.allowed}) at line(s) ${g.lines.join(', ')}`);
    }
    console.error(
      '\nA placeholder is not a label. Add <Label htmlFor={id}> with const id = useId(),\n' +
        'or aria-label="<what goes here>" when there is no room for visible text.\n',
    );
    process.exit(1);
  }

  const shrunk = total < baseline.total;
  console.log(
    `[field-names] ${total} unnamed field(s) (baseline ${baseline.total}).` +
      (shrunk ? ' Lower than the baseline: run with --write to lock it in.' : ''),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
