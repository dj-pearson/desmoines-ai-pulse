/**
 * The Explore row: every Explore section as a plain text link, on every
 * Explore page (explore pass 2 WP1 item 6). `/music`, `/sports` and `/deals`
 * linked no sibling Explore page before this; the hub was the only page where
 * "everything connects" was true.
 *
 * `current` is the section the page belongs to, e.g. "/attractions" on an
 * attraction detail page. That link carries aria-current="page" and stays a
 * link, so the row has the same shape on every page.
 */
import { Link } from 'react-router-dom';
import { HUB_EXPLORE_LINKS } from '@/lib/hubLinks';
import { cn } from '@/lib/utils';

export interface ExploreSectionLinksProps {
  current: string;
  className?: string;
}

export function ExploreSectionLinks({ current, className }: ExploreSectionLinksProps) {
  return (
    <nav aria-label="Explore Des Moines" className={className} data-explore-section-links="">
      <ul className="flex flex-wrap gap-x-5 gap-y-0">
        {HUB_EXPLORE_LINKS.map((l) => {
          const isCurrent = l.href === current;
          return (
            <li key={l.href}>
              <Link
                to={l.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center text-sm underline-offset-4 hover:text-primary',
                  isCurrent ? 'font-semibold text-foreground no-underline' : 'font-medium text-foreground underline',
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
