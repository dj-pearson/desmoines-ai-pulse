import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tag, Copy, Check, Clock } from 'lucide-react';
import {
  getDealTypeLabel,
  getDealExpiryBadge,
  formatDealSchedule,
  hasDealSchedule,
  isDealLiveAt,
} from '@/hooks/useDeals';
import type { Deal } from '@/hooks/useDeals';

interface DealCardProps {
  deal: Deal;
  onClaim?: (dealId: string) => void;
  /** Venue page for the business, when the deal's entity resolved to one. */
  venueHref?: string | null;
  /** The instant badges are computed against; the page passes one clock to every card. */
  now?: Date;
}

type CopyState = 'idle' | 'copied' | 'manual';

export function DealCard({ deal, onClaim, venueHref, now }: DealCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const codeRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = now ?? new Date();
  const expiryBadge = getDealExpiryBadge(deal, at);
  const schedule = formatDealSchedule(deal);
  const liveNow = hasDealSchedule(deal) && isDealLiveAt(deal, at);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleClaim = () => {
    // Reveal first: the claim only records a reveal, and a failed RPC must not
    // take the code away from someone standing at the register.
    setRevealed(true);
    onClaim?.(deal.id);
  };

  const selectCode = () => {
    const node = codeRef.current;
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopyCode = async () => {
    if (!deal.code) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      // navigator.clipboard is undefined on insecure origins and rejects when
      // permission is denied (iOS in-app browsers do both).
      await navigator.clipboard.writeText(deal.code);
      setCopyState('copied');
      resetTimer.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      selectCode();
      setCopyState('manual');
    }
  };

  const status =
    copyState === 'copied'
      ? 'Promo code copied'
      : copyState === 'manual'
        ? 'Press and hold to copy'
        : '';

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
              <Tag className="h-3 w-3 mr-1" aria-hidden="true" />
              {getDealTypeLabel(deal.deal_type)}
            </Badge>
            {deal.is_featured && (
              <Badge variant="outline">Featured</Badge>
            )}
            {liveNow && (
              <Badge variant="default" className="bg-green-700 hover:bg-green-700 text-white">
                Live now
              </Badge>
            )}
            {deal.is_verified && (
              <Badge variant="secondary">Verified</Badge>
            )}
            {expiryBadge && (
              <Badge variant={expiryBadge.variant}>{expiryBadge.text}</Badge>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-lg mb-1">{deal.title}</h3>
        <p className="text-sm text-muted-foreground mb-1">
          {venueHref ? (
            <Link to={venueHref} className="underline underline-offset-2 hover:text-foreground">
              {deal.business_name}
            </Link>
          ) : (
            deal.business_name
          )}
        </p>

        {schedule && (
          <p className="text-sm mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span>{schedule}</span>
          </p>
        )}

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
            <div>
              <div className="flex items-center gap-2">
                <div
                  ref={codeRef}
                  className="flex-1 bg-muted rounded px-3 py-2 text-center font-mono font-bold tracking-wider select-all"
                >
                  {deal.code}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={handleCopyCode}
                  aria-label={copyState === 'copied' ? 'Promo code copied' : 'Copy promo code'}
                >
                  {copyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p
                aria-live="polite"
                role="status"
                className={status ? 'mt-2 text-xs text-muted-foreground text-center' : 'sr-only'}
              >
                {status}
              </p>
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
