/**
 * PseoRoutePage — Catch-all page component for pSEO routes.
 *
 * Uses the URL path to look up the corresponding pSEO page from the database.
 * Falls back to 404 if no page exists for the given path.
 */

import { useLocation } from 'react-router-dom';
import { PseoPage } from '../components/PseoPage';
import { usePseoPage } from '../hooks/usePseoPage';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function PseoRoutePage() {
  const location = useLocation();
  const { data: page, isLoading, error } = usePseoPage(location.pathname);

  if (isLoading) {
    return <PseoPageSkeleton />;
  }

  if (!page) {
    return <PseoPageNotFound />;
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

function PseoPageNotFound() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="container mx-auto px-4 py-16 text-center max-w-lg">
          <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you&apos;re looking for doesn&apos;t exist yet.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/things-to-do">
                Browse Things to Do
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
