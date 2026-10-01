/**
 * SEO-065: /restaurants/<area> when no restaurant has that slug.
 *
 * RestaurantDetails renders this only after its own lookup came back empty
 * and the slug is a taxonomy location (isRestaurantAreaSlug), so a real
 * restaurant can never be shadowed by an area page. The published pseo_pages
 * row is rendered exactly as the generic pSEO route would render it; with no
 * published row the caller's not-found state is shown, unchanged.
 */
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PseoPage } from '../components/PseoPage';
import { usePseoPage } from '../hooks/usePseoPage';

interface RestaurantAreaPseoPageProps {
  slug: string;
  /** What to show when there is no published area page either. */
  notFound: ReactNode;
}

export default function RestaurantAreaPseoPage({ slug, notFound }: RestaurantAreaPseoPageProps) {
  const { data: page, isLoading } = usePseoPage(`/restaurants/${slug}`);

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8 space-y-8">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <span className="sr-only">Loading restaurants</span>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!page) return <>{notFound}</>;
  return <PseoPage page={page} />;
}
