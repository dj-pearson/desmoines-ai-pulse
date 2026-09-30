import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface PseoBreadcrumbsProps {
  items: Array<{ name: string; url: string }>;
}

export function PseoBreadcrumbs({ items }: PseoBreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {/* The icon is the whole of this link, and a lucide glyph contributes no
          text, so without the label the link has no accessible name at all -
          a WCAG 2.4.4 failure, and a crawler sees an anchor pointing nowhere
          it can describe. */}
      <Link
        to="/"
        aria-label="Home"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
      </Link>
      {items.map((item, index) => (
        <span key={item.url} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {index === items.length - 1 ? (
            <span className="text-foreground font-medium">{item.name}</span>
          ) : (
            <Link to={item.url} className="hover:text-foreground transition-colors">
              {item.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
