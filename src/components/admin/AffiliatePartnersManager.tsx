import { useState } from 'react';
import { AFFILIATE_PARTNERS, type AffiliatePartner } from '@/lib/affiliateAds';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ExternalLink, ImageIcon, Hotel } from 'lucide-react';
import { storage } from '@/lib/safeStorage';
import { useToast } from '@/hooks/use-toast';
import { useAffiliateAdLinks } from '@/hooks/useAffiliateAdLinks';

const OVERRIDES_KEY = 'affiliate_partner_overrides';

/** Inactive placeholder brands that don't have assets yet */
const PLACEHOLDER_BRANDS = [
  { id: 'choice', name: 'Choice Hotels' },
  { id: 'hilton', name: 'Hilton' },
];

export function AffiliatePartnersManager() {
  const { toast } = useToast();
  const deepLinks = useAffiliateAdLinks();
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
    storage.get<Record<string, boolean>>(OVERRIDES_KEY, {}) ?? {}
  );

  const isActive = (partner: AffiliatePartner) =>
    overrides[partner.id] !== undefined ? overrides[partner.id] : partner.isActive;

  const handleToggle = (partnerId: string, checked: boolean) => {
    const next = { ...overrides, [partnerId]: checked };
    setOverrides(next);
    storage.set(OVERRIDES_KEY, next);
    toast({
      title: checked ? 'Partner Enabled' : 'Partner Disabled',
      description: `Affiliate partner has been ${checked ? 'enabled' : 'disabled'}. Changes take effect on next page load.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hotel className="h-5 w-5 text-blue-500" />
          Affiliate Partners
        </CardTitle>
        <CardDescription>
          Manage affiliate ad partners. When no paid campaign fills a slot, an affiliate ad from
          one of these partners is shown to free-tier users. All slots on a page show the same
          brand, rotating every 30 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Affiliate URL</TableHead>
              <TableHead>Assets</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AFFILIATE_PARTNERS.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.name}</TableCell>
                <TableCell>
                  {(() => {
                    // The deep link from hotel_affiliate_programs wins when the
                    // brand is configured; otherwise this still shows the static
                    // loyalty-enrolment fallback that is actually being served.
                    const deepLink = deepLinks[partner.brandParent];
                    const url = deepLink ?? partner.affiliateUrl;
                    return (
                      <div className="space-y-1">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {url.replace(/^https?:\/\//, '').slice(0, 30)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {deepLink ? (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                            Deep linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Loyalty signup — set a banner destination
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(['728x90', '300x250', '160x600'] as const).map((size) => (
                      <Badge key={size} variant="outline" className="text-xs">
                        {size}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <img
                    src={partner.assets['300x250']}
                    alt={`${partner.name} preview`}
                    className="h-16 w-auto rounded border"
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={isActive(partner)}
                    onCheckedChange={(checked) => handleToggle(partner.id, checked)}
                    aria-label={`Toggle ${partner.name} affiliate ads`}
                  />
                </TableCell>
              </TableRow>
            ))}

            {/* Placeholder brands without assets */}
            {PLACEHOLDER_BRANDS.map((brand) => (
              <TableRow key={brand.id} className="opacity-50">
                <TableCell className="font-medium">{brand.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">—</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                    <ImageIcon className="h-3 w-3 mr-1" />
                    No assets
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">—</TableCell>
                <TableCell>
                  <Switch disabled aria-label={`${brand.name} not available`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
