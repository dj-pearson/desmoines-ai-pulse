import { useConversionFunnelData, type FunnelKind } from '@/hooks/useConversionFunnel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { TrendingDown } from 'lucide-react';

const COPY: Record<FunnelKind, { title: string; empty: string; from: string; to: string }> = {
  subscription: {
    title: 'Subscription Conversion Funnel (Last 30 Days)',
    empty: 'No funnel data yet. Events are recorded when users visit the pricing page and proceed through checkout.',
    from: 'visitors',
    to: 'subscribers',
  },
  advertiser: {
    title: 'Advertiser Conversion Funnel (Last 30 Days)',
    empty:
      'No advertiser funnel data yet. Events are recorded when a business opens /advertise, saves a campaign and pays for it.',
    from: 'visitors',
    to: 'paid campaigns',
  },
};

interface ConversionFunnelChartProps {
  funnel?: FunnelKind;
}

export default function ConversionFunnelChart({ funnel = 'subscription' }: ConversionFunnelChartProps) {
  const { data: steps, isLoading, error, refetch } = useConversionFunnelData(30, funnel);
  const copy = COPY[funnel];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState
            error={error}
            title="The funnel didn't load"
            description="The counts couldn't be read, so this is not an empty funnel. Try again in a moment."
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const last = steps && steps.length > 0 ? steps[steps.length - 1] : null;
  const maxCount = Math.max(...(steps?.map((s) => s.count) || [1]), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!steps || steps.every((s) => s.count === 0)) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {copy.empty}
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

            {last && steps.length > 1 && steps[0].count > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Overall Conversion Rate:{' '}
                  <span className="text-primary">
                    {((last.count / steps[0].count) * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {steps[0].count} {copy.from} → {last.count} {copy.to}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
