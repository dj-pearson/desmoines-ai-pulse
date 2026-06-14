/**
 * PseoRoutePage — Catch-all page component for pSEO routes.
 *
 * Validates the URL against the known pSEO taxonomy before doing anything else,
 * so arbitrary/typo paths caught by the generic /:seg1[/:seg2] routes render a
 * real 404 instead of a thin pSEO shell (avoids soft-404 indexing). Taxonomy-
 * valid paths are looked up in the database; a miss is also a real 404.
 */

import { useLocation } from 'react-router-dom';
import { PseoPage } from '../components/PseoPage';
import { usePseoPage } from '../hooks/usePseoPage';
import { allDimensions } from '../taxonomy';
import { Skeleton } from '@/components/ui/skeleton';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import NotFound from '@/pages/NotFound';

// Every slug across all taxonomy dimensions (content_type, location, audience,
// temporal, category) — the universe of valid generic pSEO path segments.
const KNOWN_PSEO_SLUGS = new Set(
  allDimensions.flatMap((d) => d.values.map((v) => v.slug))
);

// Curated prefixes that have their own explicit pSEO routes in App.tsx.
const PSEO_PREFIXES = new Set(['things-to-do', 'nightlife', 'guide']);

/**
 * A path is a candidate pSEO page only when it is one or two segments and
 * either starts with a curated prefix or is composed entirely of recognized
 * taxonomy slugs (e.g. /italian, /brunch/east-village).
 */
function isKnownPseoPath(pathname: string): boolean {
  const segs = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segs.length === 0 || segs.length > 2) return false;
  if (PSEO_PREFIXES.has(segs[0])) return true;
  return segs.every((s) => KNOWN_PSEO_SLUGS.has(s));
}

export default function PseoRoutePage() {
  const location = useLocation();
  const isValidPath = isKnownPseoPath(location.pathname);
  const { data: page, isLoading } = usePseoPage(location.pathname, {
    enabled: isValidPath,
  });

  // Unknown path, or a taxonomy-valid path with no published page → real 404.
  if (!isValidPath) {
    return <NotFound />;
  }

  if (isLoading) {
    return <PseoPageSkeleton />;
  }

  if (!page) {
    return <NotFound />;
  }

  return <PseoPage page={page} />;
}

function PseoPageSkeleton() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 space-y-8">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
