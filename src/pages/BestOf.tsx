import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useVotingCategories } from '@/hooks/useVoting';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Vote } from 'lucide-react';

export default function BestOf() {
  const { data: categories, isLoading } = useVotingCategories();

  return (
    <>
      <Helmet>
        <title>Des Best - Vote for the Best of Des Moines | Des Moines Insider</title>
        <meta name="description" content="Vote for the best pizza, coffee, brunch, date night spots, and more in Des Moines. Community-powered Best Of voting." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Trophy className="h-5 w-5" />
              <span className="font-semibold">Des Best 2026</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Vote for the Best of Des Moines
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Help crown the best restaurants, venues, and hidden gems in the Des Moines area.
              One vote per category — make it count!
            </p>
          </div>

          {/* Category grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories?.map((cat) => (
                <Link key={cat.id} to={`/best-of/${cat.slug}`}>
                  <Card className="hover:border-primary transition-colors h-full">
                    <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                      <div className="text-3xl">
                        <CategoryIcon icon={cat.icon} />
                      </div>
                      <h2 className="text-lg font-semibold">{cat.name}</h2>
                      {cat.description && (
                        <p className="text-sm text-muted-foreground">{cat.description}</p>
                      )}
                      <Badge variant="secondary" className="mt-auto">
                        <Vote className="h-3 w-3 mr-1" />
                        {cat.vote_count || 0} votes
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}

function CategoryIcon({ icon }: { icon: string }) {
  const iconMap: Record<string, string> = {
    pizza: '🍕',
    coffee: '☕',
    beer: '🍺',
    egg: '🍳',
    heart: '❤️',
    gem: '💎',
    truck: '🚚',
    icecream: '🍦',
    music: '🎵',
    trophy: '🏆',
  };
  return <span>{iconMap[icon] || '🏆'}</span>;
}
