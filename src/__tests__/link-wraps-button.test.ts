import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * No <Link>/<a> whose first child is a plain <Button>.
 *
 * `<Link to="/events"><Button>Go</Button></Link>` renders <a><button></a>: an
 * interactive element inside another, which HTML forbids. Keyboard users get
 * two tab stops for one action and screen readers announce "link, button".
 * The fix is `<Button asChild><Link to="/events">Go</Link></Button>`, which renders
 * a single <a> with the button styles.
 *
 * axe only sees the pages e2e happens to load, so this reads the source.
 */

const SRC = join(__dirname, '..');

/**
 * Files owned by other in-flight changes. Each entry is a known offender that
 * must be fixed there and then removed from this list. Empty means none.
 */
const ALLOWED = new Set<string>([]);

const WRAPPER = /<(Link|NavLink|a)(?=[\s>/])/g;

/** Index just past the `>` that closes the JSX opening tag starting at `start`, and whether it self-closes. */
function endOfOpeningTag(code: string, start: number): { end: number; selfClosing: boolean } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      return { end: i + 1, selfClosing: code[i - 1] === '/' };
    }
  }
  return null;
}

/** Skip whitespace and JSX comments (`{/* ... *\/}`). */
function skipTrivia(code: string, i: number): number {
  for (;;) {
    while (i < code.length && /\s/.test(code[i])) i++;
    const comment = /^\{\s*\/\*[\s\S]*?\*\/\s*\}/.exec(code.slice(i, i + 2000));
    if (!comment) return i;
    i += comment[0].length;
  }
}

/** 1-based line numbers of every wrapper whose first child is a non-asChild <Button>. */
export function findLinkWrappedButtons(code: string): number[] {
  const lines: number[] = [];
  for (const match of code.matchAll(WRAPPER)) {
    const open = endOfOpeningTag(code, match.index! + match[0].length);
    if (!open || open.selfClosing) continue;
    const child = skipTrivia(code, open.end);
    if (!/^<Button(?=[\s>/])/.test(code.slice(child, child + 8))) continue;
    const button = endOfOpeningTag(code, child + '<Button'.length);
    if (!button) continue;
    const attrs = code.slice(child, button.end);
    if (/\basChild\b(?!\s*=\s*\{\s*false\s*\})/.test(attrs)) continue;
    lines.push(code.slice(0, match.index).split('\n').length);
  }
  return lines;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('findLinkWrappedButtons', () => {
  it('flags a Link wrapping a Button', () => {
    expect(findLinkWrappedButtons('<Link to="/events"><Button>Go</Button></Link>')).toEqual([1]);
  });

  it('flags multiline JSX with arrow functions and comments in between', () => {
    const code = [
      'const x = 1;',
      '<Link',
      '  to={`/events/${slug(a, b)}`}',
      '  onClick={() => track("x")}',
      '>',
      '  {/* the button */}',
      '  <Button',
      '    variant="outline"',
      '    onClick={(e) => e.stopPropagation()}',
      '  >',
      '    Go',
      '  </Button>',
      '</Link>',
    ].join('\n');
    expect(findLinkWrappedButtons(code)).toEqual([2]);
  });

  it('flags an anchor and NavLink wrapping a Button', () => {
    expect(findLinkWrappedButtons('<a href="https://x.test" rel="noopener"><Button size="sm">X</Button></a>')).toEqual([1]);
    expect(findLinkWrappedButtons('<NavLink to="/events">\n<Button>X</Button></NavLink>')).toEqual([1]);
  });

  it('flags asChild={false}', () => {
    expect(findLinkWrappedButtons('<Link to="/events"><Button asChild={false}>Go</Button></Link>')).toEqual([1]);
  });

  it('passes the asChild form', () => {
    expect(findLinkWrappedButtons('<Button asChild><Link to="/events">Go</Link></Button>')).toEqual([]);
    expect(
      findLinkWrappedButtons('<Button\n  variant="outline"\n  asChild\n>\n  <a href="https://x.test" target="_blank" rel="noopener noreferrer">X</a>\n</Button>'),
    ).toEqual([]);
  });

  it('passes a Link whose Button is not its first child, and unrelated tags', () => {
    expect(findLinkWrappedButtons('<Link to="/events"><span>Go</span><Button>Y</Button></Link>')).toEqual([]);
    expect(findLinkWrappedButtons('<article><Button>Y</Button></article>')).toEqual([]);
    expect(findLinkWrappedButtons('<abbr title="x"><Button>Y</Button></abbr>')).toEqual([]);
    expect(findLinkWrappedButtons('<Link to="/events" /><Button>Y</Button>')).toEqual([]);
    expect(findLinkWrappedButtons('<a href="/events"><ButtonGroup>Y</ButtonGroup></a>')).toEqual([]);
  });
});

describe('interactive nesting', () => {
  it('no Link or <a> wraps a <Button> in src/', () => {
    const offenders = tsxFiles(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .flatMap((rel) =>
        findLinkWrappedButtons(readFileSync(join(SRC, rel), 'utf8')).map((line) => `${rel}:${line}`),
      );
    expect(offenders).toEqual([]);
  });
});
