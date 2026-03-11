import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PseoRelatedPage } from '../../schemas';

interface PseoRelatedPagesProps {
  pages: PseoRelatedPage[];
}

export function PseoRelatedPages({ pages }: PseoRelatedPagesProps) {
  if (!pages.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Explore More</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <Link
            key={page.slug}
            to={page.slug}
            className="group flex items-center justify-between rounded-lg border p-4 hover:bg-accent transition-colors"
          >
            <div>
              <p className="font-medium group-hover:text-primary transition-colors">
                {page.title}
              </p>
              {page.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {page.description}
                </p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 ml-2" />
          </Link>
        ))}
      </div>
    </section>
  );
}
