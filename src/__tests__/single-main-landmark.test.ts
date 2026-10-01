import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * One <main> per page (WCAG 1.3.1, axe landmark-no-duplicate-main).
 *
 * App.tsx renders <main id="main-content"> around every route, so a page that
 * renders its own <main> nests a second landmark inside the first. The e2e
 * check in accessibility.spec.ts only loads "/", which is how PseoPage, Auth,
 * ProfilePage, Profile and UserDashboard each shipped one. Several signed-in
 * pages are hard to reach from e2e at all, so this reads the source instead.
 */

const SRC = join(__dirname, '..');

/** The one landmark, and the unused shadcn SidebarInset primitive. */
const ALLOWED = new Set(['App.tsx', 'components/ui/sidebar.tsx']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('main landmark', () => {
  it('only App.tsx renders <main>', () => {
    const offenders = tsxFiles(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => {
        const code = readFileSync(join(SRC, rel), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        return /<main[\s>]/.test(code);
      });
    expect(offenders).toEqual([]);
  });
});
