import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Star } from 'lucide-react';
import type { PseoCuratedItem } from '../../schemas';

interface PseoCuratedPicksProps {
  heading: string;
  items: PseoCuratedItem[];
}

export function PseoCuratedPicks({ heading, items }: PseoCuratedPicksProps) {
  if (!items.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">{heading}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {items.map((item, index) => (
          <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{item.name}</CardTitle>
                <div className="flex items-center gap-2">
                  {item.priceRange && (
                    <Badge variant="outline">{item.priceRange}</Badge>
                  )}
                  {item.rating && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      {item.rating}
                    </Badge>
                  )}
                </div>
              </div>
              {item.address && (
                <p className="text-sm text-muted-foreground">{item.address}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{item.description}</p>
              <p className="text-sm font-medium text-primary">
                {item.whyWeRecommend}
              </p>
              {item.insiderTip && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 p-3">
                  <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {item.insiderTip}
                  </p>
                </div>
              )}
              {item.tags?.length ? (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
