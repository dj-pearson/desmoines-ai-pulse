import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';
import { LucideSprite, SPRITE_ICON_NAMES } from '@/components/ui/icon-sprite.generated';
import { SpriteIcon } from '@/components/ui/SpriteIcon';

/**
 * The sprite exists to cut DOM weight, which is only worth anything if it draws
 * the same pixels (WEB-PERF-023). These tests are the proof, and they are
 * written against lucide itself rather than against a recorded snapshot: a
 * snapshot would go on passing after a lucide upgrade silently changed an icon,
 * which is precisely the drift the generator is designed to surface.
 */

function pascal(kebab: string) {
  // 'share-2' -> 'Share2', 'map-pin' -> 'MapPin'
  return kebab
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function innerShapes(svg: string) {
  // Everything inside the outer <svg>, normalised: the key prop lucide carries
  // is a React reconciliation hint and never reaches the DOM.
  const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return body.replace(/\s+/g, ' ').trim();
}

describe('icon sprite', () => {
  it('every sprite symbol draws the same shapes as the lucide component', () => {
    const spriteMarkup = renderToStaticMarkup(<LucideSprite />);

    for (const name of SPRITE_ICON_NAMES) {
      const Component = (lucide as unknown as Record<string, React.ComponentType>)[
        pascal(name)
      ];
      expect(Component, `lucide has no export for "${name}"`).toBeTruthy();

      const fromLucide = innerShapes(renderToStaticMarkup(<Component />));

      const symbol = spriteMarkup.match(
        new RegExp(`<symbol id="lu-${name}" viewBox="0 0 24 24">(.*?)</symbol>`, 's'),
      );
      expect(symbol, `sprite is missing a symbol for "${name}"`).toBeTruthy();
      const fromSprite = symbol![1].replace(/\s+/g, ' ').trim();

      expect(fromSprite, `sprite symbol "${name}" differs from lucide`).toBe(fromLucide);
    }
  });

  it('carries lucide default attributes so existing CSS and sizing behave the same', () => {
    const mine = renderToStaticMarkup(<SpriteIcon name="clock" className="h-4 w-4" />);
    const theirs = renderToStaticMarkup(<lucide.Clock className="h-4 w-4" />);

    const attrs = (svg: string) => {
      const open = svg.match(/^<svg([^>]*)>/)![1];
      return Object.fromEntries(
        [...open.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
    };
    const a = attrs(mine);
    const b = attrs(theirs);

    for (const key of [
      'xmlns',
      'width',
      'height',
      'viewBox',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'class',
    ]) {
      expect(a[key], `attribute ${key}`).toBe(b[key]);
    }
  });

  it('references a symbol the sprite actually defines', () => {
    const spriteMarkup = renderToStaticMarkup(<LucideSprite />);
    for (const name of SPRITE_ICON_NAMES) {
      const used = renderToStaticMarkup(<SpriteIcon name={name} />);
      const href = used.match(/<use href="([^"]+)"/)![1];
      expect(href).toBe(`#lu-${name}`);
      expect(spriteMarkup).toContain(`id="lu-${name}"`);
    }
  });

  it('is decorative unless given a title', () => {
    const plain = renderToStaticMarkup(<SpriteIcon name="clock" />);
    expect(plain).toContain('aria-hidden="true"');
    expect(plain).not.toContain('<title>');

    const labelled = renderToStaticMarkup(<SpriteIcon name="clock" title="Start time" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).not.toContain('aria-hidden');
    expect(labelled).toContain('<title>Start time</title>');
  });
});
