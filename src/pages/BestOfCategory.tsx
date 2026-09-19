import { useParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useCategoryResults } from '@/hooks/useVoting';
import { VotingBooth } from '@/components/VotingBooth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, ArrowLeft, Medal } from 'lucide-react';
import { RouteCanonical } from '@/components/RouteCanonical';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { getCanonicalUrl } from '@/lib/brandConfig';

export default function BestOfCategory() {
  const { category: categorySlug } = useParams<{ category: string }>();
  const { data, isLoading } = useCategoryResults(categorySlug || '');

  const category = data?.category;
  const results = data?.results || [];
  const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);

  // WEB-SEO-035 AC3. Only the ranked entries that HAVE a page, and in rank
  // order, so numberOfItems and the positions match what a crawler reads off
  // the list above. Custom write-ins are not addressable and are left out of
  // both the links and the schema.
  const schemaItems = results
    .filter((r) => r.url && r.name)
    .map((r, index) => ({
      name: r.name as string,
      url: getCanonicalUrl(r.url as string),
      position: index + 1,
      ...(r.image_url ? { image: r.image_url } : {}),
    }));

  return (
    <>
      {/* WEB-SEO-035. This page had NO canonical at all, so every /best-of/
          category inherited the SPA shell's - each one declaring itself a
          duplicate of the home page. That is why the family was held out of
          the sitemaps. Unlike the detail pages, this one is not in a loading
          branch: nothing else here emits a canonical, so there is no second
          tag for it to collide with. */}
      <RouteCanonical path={`/best-of/${categorySlug ?? ''}`} />
      <Helmet>
        <title>{category ? `${category.name} - Des Best` : 'Des Best'} | Des Moines Insider</title>
        <meta name="description" content={category?.description || 'Vote for the best of Des Moines'} />
      </Helmet>
      {schemaItems.length > 0 && (
        <ItemListSchema
          name={category ? `Best ${category.name} in Des Moines` : 'Des Best rankings'}
          description={category?.description || undefined}
          items={schemaItems}
        />
      )}
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Link to="/best-of" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            All Categories
          </Link>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
          ) : !category ? (
            <>
              <Helmet>
                <meta name="robots" content="noindex, follow" />
                <meta name="googlebot" content="noindex, follow" />
              </Helmet>
              <p className="text-muted-foreground">Category not found.</p>
            </>
          ) : (
            <div className="space-y-8">
              {/* Header */}
              <div>
                <h1 className="text-3xl font-bold mb-2">{category.name}</h1>
                {category.description && (
                  <p className="text-muted-foreground">{category.description}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {totalVotes} total vote{totalVotes !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Voting Booth */}
              <VotingBooth category={category} />

              {/* Results */}
              {results.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Current Rankings
                  </h2>
                  <div className="space-y-2">
                    {results.map((result, index) => {
                      const percentage = totalVotes > 0 ? Math.round((result.vote_count / totalVotes) * 100) : 0;
                      return (
                        <Card key={result.entity_id || result.custom_entry || index}>
                          <CardContent className="p-4 flex items-center gap-4">
                            {/* Rank */}
                            <div className="flex-shrink-0 w-8 text-center">
                              {index === 0 ? (
                                <Medal className="h-6 w-6 text-yellow-500 mx-auto" />
                              ) : index === 1 ? (
                                <Medal className="h-6 w-6 text-gray-500 mx-auto" />
                              ) : index === 2 ? (
                                <Medal className="h-6 w-6 text-amber-700 mx-auto" />
                              ) : (
                                <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>
                              )}
                            </div>

                            {/* Image */}
                            {result.image_url ? (
                              <img src={result.image_url} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xl">
                                {result.entity_type === 'custom' ? '✏️' : '🏠'}
                              </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              {result.url ? (
                                <Link
                                  to={result.url}
                                  className="font-medium truncate block hover:text-primary underline-offset-4 hover:underline"
                                >
                                  {result.name}
                                </Link>
                              ) : (
                                <p className="font-medium truncate">{result.name || 'Unknown'}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm text-muted-foreground flex-shrink-0">
                                  {percentage}%
                                </span>
                              </div>
                            </div>

                            {/* Vote count */}
                            <Badge variant="outline" className="flex-shrink-0">
                              {result.vote_count} vote{result.vote_count !== 1 ? 's' : ''}
                            </Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
