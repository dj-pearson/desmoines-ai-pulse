import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tag, Copy, Check } from 'lucide-react';
import { getDealTypeLabel, getDealExpiryBadge } from '@/hooks/useDeals';
import type { Deal } from '@/hooks/useDeals';

interface DealCardProps {
  deal: Deal;
  onClaim?: (dealId: string) => void;
}

export function DealCard({ deal, onClaim }: DealCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const expiryBadge = getDealExpiryBadge(deal.end_date);

  const handleClaim = () => {
    setRevealed(true);
    onClaim?.(deal.id);
  };

  const handleCopyCode = async () => {
    if (deal.code) {
      await navigator.clipboard.writeText(deal.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      {deal.image_url && (
        <div className="h-40 overflow-hidden rounded-t-lg">
          <img src={deal.image_url} alt={deal.title} width={640} height={160} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        </div>
      )}
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default">
              <Tag className="h-3 w-3 mr-1" />
              {getDealTypeLabel(deal.deal_type)}
            </Badge>
            {deal.is_verified && (
              <Badge variant="secondary">Verified</Badge>
            )}
            {expiryBadge && (
              <Badge variant={expiryBadge.variant}>{expiryBadge.text}</Badge>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-lg mb-1">{deal.title}</h3>
        <p className="text-sm text-muted-foreground mb-1">{deal.business_name}</p>

        {deal.discount_value && (
          <p className="text-xl font-bold text-primary mb-2">{deal.discount_value}</p>
        )}

        {deal.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{deal.description}</p>
        )}

        {deal.terms && (
          <p className="text-xs text-muted-foreground mb-3 italic">{deal.terms}</p>
        )}

        <div className="mt-auto">
          {!revealed ? (
            <Button className="w-full" onClick={handleClaim}>
              Claim Deal
            </Button>
          ) : deal.code ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded px-3 py-2 text-center font-mono font-bold tracking-wider">
                {deal.code}
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyCode}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-2 text-center text-sm">
              Show this screen at the register to redeem
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
