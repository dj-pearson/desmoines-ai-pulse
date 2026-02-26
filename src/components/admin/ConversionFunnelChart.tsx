import { useConversionFunnelData } from '@/hooks/useConversionFunnel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown } from 'lucide-react';

export default function ConversionFunnelChart() {
  const { data: steps, isLoading } = useConversionFunnelData(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...(steps?.map((s) => s.count) || [1]), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Subscription Conversion Funnel (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!steps || steps.every((s) => s.count === 0)) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No funnel data yet. Events are recorded when users visit the pricing page and proceed through checkout.
          </p>
        ) : (
          <div className="space-y-4">
            {steps.map((step, i) => {
              const widthPercent = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 4) : 4;
              return (
                <div key={step.event}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{step.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {step.count.toLocaleString()}
                      {i > 0 && step.dropOffPercent > 0 && (
                        <span className="text-destructive ml-2">
                          -{step.dropOffPercent}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {steps.length >= 4 && steps[0].count > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Overall Conversion Rate:{' '}
                  <span className="text-primary">
                    {((steps[3].count / steps[0].count) * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {steps[0].count} visitors → {steps[3].count} subscribers
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
