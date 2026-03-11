import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface PseoBreadcrumbsProps {
  items: Array<{ name: string; url: string }>;
}

export function PseoBreadcrumbs({ items }: PseoBreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-4 w-4" />
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
