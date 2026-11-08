#!/usr/bin/env node
/**
 * WEB-UX-056. An icon-only button with no accessible name.
 *
 * A <Button><Trash2 /></Button> renders an <svg> and nothing else. Screen
 * readers announce it as "button", so an admin working through ContentTable
 * with VoiceOver hears "button, button, button" across the edit, delete and
 * feature actions of every row and has to guess which one deletes.
 *
 * WHAT COUNTS AS ICON-ONLY. A <Button>, <button> or <Toggle> whose children are all
 * capitalised JSX elements with no text anywhere inside them (Lucide icons,
 * SpriteIcon, and so on), with no aria-label, aria-labelledby or title on the
 * button itself. Anything that might carry a name is given the benefit of the
 * doubt, on purpose, so the count is a floor and never a false alarm:
 *   - a {...spread} on the button (the name may arrive in the props)
 *   - an {expression} child that could render text (a variable, a call, a
 *     string); see below for the expressions that cannot
 *   - any lowercase element child (a <span className="sr-only"> is a name)
 *
 * WEB-UX-060 closed two holes in that floor, found by hand in slice 2:
 *   - {cond ? <Pause /> : <Play />} and {busy && <Loader2 />} are icons too.
 *     An expression child counts as silent when every branch of its ternaries
 *     and the right side of its && are silent icons, null, undefined or false.
 *   - <Button asChild><a href={url}><ExternalLink /></a></Button> renders an
 *     icon-only link. asChild is checked by looking through to the one child
 *     element: it is unnamed when that child has no name attribute or spread
 *     and holds only silent icons. A child with any text still passes.
 *
 * SO THIS IS A RATCHET. Fixing the existing buttons is the story's work; what
 * was missing is anything stopping new ones. A file may lose unnamed icon
 * buttons freely. It may not gain one, and a file with none may not acquire
 * its first. src/components/ui is excluded: those are the shadcn primitives,
 * whose names come from the caller.
 *
 * Offline. Parses with the TypeScript compiler, so comments and strings that
 * merely mention <Button> are never counted.
 *
 *   node scripts/check-icon-button-names.mjs           # check
 *   node scripts/check-icon-button-names.mjs --list    # print every offender
 *   node scripts/check-icon-button-names.mjs --write   # re-baseline (only ever downward)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src/components', 'src/pages'].map((p) => join(ROOT, p));
const BASELINE = join(ROOT, '.github', 'icon-button-names-baseline.json');
const WRITE = process.argv.includes('--write');
const LIST = process.argv.includes('--list');

const EXCLUDE = /[\\/]components[\\/]ui[\\/]|__tests__|\.test\.tsx$/;
const NAME_ATTRS = new Set(['aria-label', 'aria-labelledby', 'title']);
/** Toggle is the shadcn pressed-state button; the CMS editor toolbar is 19 of them. */
const BUTTON_TAGS = new Set(['Button', 'button', 'Toggle']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx') && !EXCLUDE.test(full)) out.push(full);
  }
  return out;
}

function tagName(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText();
}

/** True when the element (an icon candidate) holds no text and no expression. */
function isSilentIcon(node) {
  if (ts.isJsxSelfClosingElement(node)) return /^[A-Z]/.test(tagName(node));
  if (ts.isJsxElement(node)) {
    if (!/^[A-Z]/.test(tagName(node))) return false;
    return node.children.every(isSilentChild);
  }
  return false;
}

function isSilentChild(child) {
  if (ts.isJsxText(child)) return child.getText().trim() === '';
  if (ts.isJsxExpression(child)) {
    return child.expression === undefined || isSilentExpression(child.expression); // {/* comment */}
  }
  return isSilentIcon(child);
}

/** True for a value that renders nothing: null, undefined, false. */
function rendersNothing(expr) {
  return (
    expr.kind === ts.SyntaxKind.NullKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(expr) && expr.text === 'undefined')
  );
}

/**
 * True when an expression can only render silent icons or nothing:
 * `a ? <X /> : <Y />`, `a && <X />`, `a ? <X /> : null`, nested and parenthesised.
 * Anything else (a variable, a call, a string, a fragment) may render text.
 */
function isSilentExpression(expr) {
  if (ts.isParenthesizedExpression(expr)) return isSilentExpression(expr.expression);
  if (ts.isConditionalExpression(expr)) {
    const { whenTrue, whenFalse } = expr;
    if (rendersNothing(whenTrue) && rendersNothing(whenFalse)) return false;
    return isSilentBranch(whenTrue) && isSilentBranch(whenFalse);
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return isSilentBranch(expr.right);
  }
  return ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) ? isSilentIcon(expr) : false;
}

/** A branch may render nothing; the other branch has to hold the icon. */
function isSilentBranch(expr) {
  return rendersNothing(expr) || isSilentExpression(expr);
}

/** True when a child counts toward "icon-only": an icon, or an expression of icons. */
function isMeaningfulSilent(child) {
  if (ts.isJsxExpression(child)) return child.expression !== undefined && isSilentExpression(child.expression);
  return isSilentIcon(child);
}

function isBlank(child) {
  return (ts.isJsxText(child) && child.getText().trim() === '') ||
    (ts.isJsxExpression(child) && child.expression === undefined);
}

/** True when an element's own children are all silent and at least one exists. */
function holdsOnlyIcons(node) {
  const meaningful = node.children.filter((c) => !isBlank(c));
  return meaningful.length > 0 && meaningful.every(isMeaningfulSilent);
}

/**
 * asChild hands the button's role and props to its one child element, so the
 * name has to be on that child or inside it.
 */
function isUnnamedAsChild(node) {
  const elements = node.children.filter((c) => !isBlank(c));
  if (elements.length !== 1 || !ts.isJsxElement(elements[0])) return false;
  const child = elements[0];
  if (hasName(child.openingElement.attributes)) return false;
  return holdsOnlyIcons(child);
}

function hasAsChild(attributes) {
  return attributes.properties.some(
    (attr) => ts.isJsxAttribute(attr) && attr.name.getText() === 'asChild',
  );
}

function hasName(attributes) {
  for (const attr of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) return true;
    if (NAME_ATTRS.has(attr.name.getText())) return true;
  }
  return false;
}

/** Offending buttons in one file, as 1-based line numbers. */
export function findUnnamedIconButtons(source, fileName = 'file.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = [];
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const name = tagName(node);
      const attrs = node.openingElement.attributes;
      if (BUTTON_TAGS.has(name) && !hasName(attrs)) {
        const unnamed = hasAsChild(attrs) ? isUnnamedAsChild(node) : holdsOnlyIcons(node);
        if (unnamed) lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

function scan() {
  const files = {};
  for (const dir of ROOTS) {
    for (const full of walk(dir)) {
      const lines = findUnnamedIconButtons(readFileSync(full, 'utf8'), full);
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
      console.error(`[icon-button-names] refusing to raise the baseline from ${baseline.total} to ${total}.`);
      process.exit(1);
    }
    const out = {
      _comment:
        'Icon-only <Button>/<button>/<Toggle> with no aria-label, aria-labelledby or title, per file (WEB-UX-056). Screen readers announce these as "button". This list must only ever SHRINK - give the button an aria-label naming the action and its target.',
      generated: new Date().toISOString().slice(0, 10),
      total,
      files: counts,
    };
    writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
    console.log(`[icon-button-names] baseline written: ${total} in ${Object.keys(counts).length} files.`);
    return;
  }

  if (!baseline) {
    console.error('[icon-button-names] no baseline; run with --write.');
    process.exit(1);
  }

  const grew = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline.files[file] ?? 0;
    if (n > allowed) grew.push({ file, n, allowed, lines: found[file] });
  }

  if (grew.length > 0) {
    console.error(`\n[icon-button-names] ${grew.length} file(s) gained an icon-only button with no accessible name:\n`);
    for (const g of grew) {
      console.error(`  ${g.file}: ${g.n} (baseline ${g.allowed}) at line(s) ${g.lines.join(', ')}`);
    }
    console.error(
      '\nA screen reader announces these as "button". Add aria-label="<action> <target>",\n' +
        'e.g. aria-label={`Delete ${item.title}`}, and aria-hidden="true" on the icon.\n',
    );
    process.exit(1);
  }

  const shrunk = total < baseline.total;
  console.log(
    `[icon-button-names] ${total} unnamed icon button(s) (baseline ${baseline.total}).` +
      (shrunk ? ' Lower than the baseline: run with --write to lock it in.' : ''),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
