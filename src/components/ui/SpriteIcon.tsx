import React from 'react';
import { cn } from '@/lib/utils';
import type { SpriteIconName } from '@/components/ui/icon-sprite.generated';

/**
 * A lucide icon rendered from the page sprite instead of inline (WEB-PERF-023).
 *
 * <SpriteIcon name="clock" className="h-4 w-4" /> is a drop-in for <Clock
 * className="h-4 w-4" />: the outer <svg> carries lucide's own defaultAttributes
 * and the same `lucide lucide-clock` classes, so existing CSS and Tailwind
 * sizing behave identically. The difference is the body - one <use> pointing at
 * a <symbol> the page already carries, instead of 2-5 freshly serialized nodes.
 *
 * WHY IT MATTERS AT ALL: on a list route the same seven icons repeat once per
 * card. Measured on the prerendered /events, 33 of a card's 67 elements were
 * icon internals. Two nodes per icon instead of up to six is the only lever
 * that cuts that without changing a single pixel.
 *
 * DECORATIVE BY DEFAULT, which matches how these are used - an icon beside its
 * own text label. Pass a `title` when the icon is the only label; that renders a
 * <title> and drops aria-hidden, so it costs one extra node exactly when it has
 * to.
 *
 * The referenced symbol must exist: only names in SPRITE_ICON_NAMES are
 * accepted, and the type is generated from the same list the sprite is built
 * from, so a typo is a compile error rather than an invisible icon.
 */
export interface SpriteIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: SpriteIconName;
  /** Accessible name. Omit for decorative icons (the default). */
  title?: string;
}

export function SpriteIcon({ name, className, title, ...rest }: SpriteIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide', `lucide-${name}`, className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <use href={`#lu-${name}`} />
    </svg>
  );
}
