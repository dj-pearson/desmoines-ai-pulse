import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInTimeZone } from 'date-fns-tz';
import { Tag, Copy, Check, Clock } from 'lucide-react';
import {
  getDealTypeLabel,
  getDealExpiryBadge,
  formatDealSchedule,
  hasDealSchedule,
  isDealLiveAt,
  dealTodayStatus,
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

/** "Dec 31, 2026" in Des Moines time, or null for an open-ended or unreadable date. */
function validThroughLabel(endDate: string | null): string | null {
  if (!endDate) return null;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return null;
  return formatInTimeZone(d, 'America/Chicago', 'MMM d, yyyy');
}

export function DealCard({ deal, onClaim, venueHref, now }: DealCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const codeRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = now ?? new Date();
  const expiryBadge = getDealExpiryBadge(deal, at);
  const schedule = formatDealSchedule(deal);
  const liveNow = hasDealSchedule(deal) && isDealLiveAt(deal, at);
  // "Starts 4 PM" / "Ended for today", from the same clock as the badge.
  const today = dealTodayStatus(deal, at);
  const validThrough = validThroughLabel(deal.end_date);

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
                Running now
              </Badge>
            )}
            {/* No Verified badge: is_verified is a checkbox with no date and no
                stated meaning (plan D10), so the badge claimed something
                nobody could check. */}
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
            {today && today.kind !== 'running' && (
              <span className="text-muted-foreground">&middot; {today.text}</span>
            )}
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
              {deal.code ? 'Show code' : 'Show deal'}
            </Button>
          ) : (
            <div className="rounded-md bg-muted/60 p-3 space-y-2">
              {/* What the person at the register needs to see, on one screen. */}
              <div>
                <p className="text-sm font-semibold">{deal.title}</p>
                {deal.discount_value && <p className="text-sm">{deal.discount_value}</p>}
                {deal.terms && <p className="text-xs text-muted-foreground">{deal.terms}</p>}
                <p className="text-xs text-muted-foreground">
                  {validThrough ? `Valid through ${validThrough}` : 'No end date listed'}
                </p>
              </div>
              {deal.code ? (
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      ref={codeRef}
                      className="flex-1 bg-background rounded px-3 py-2 text-center font-mono font-bold tracking-wider select-all"
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
                <p className="text-sm">Show this screen at the register to redeem.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
