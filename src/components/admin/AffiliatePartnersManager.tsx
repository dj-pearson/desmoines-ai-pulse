import { AFFILIATE_PARTNERS } from '@/lib/affiliateAds';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ImageIcon, Hotel } from 'lucide-react';

/** Inactive placeholder brands that don't have assets yet */
const PLACEHOLDER_BRANDS = [
  { id: 'choice', name: 'Choice Hotels' },
  { id: 'hilton', name: 'Hilton' },
];

/**
 * The affiliate banner partners, read-only (plan WP6).
 *
 * This had an "Active" switch that wrote the ADMIN'S OWN localStorage
 * (affiliate_partner_overrides) and nothing ever read it: getActiveAffiliatePartners
 * filters on the static isActive flag, so switching a partner off changed
 * nothing for any visitor while the toast said it had. The switch is gone
 * rather than moved to a server table: a server-backed flag would cost a
 * Supabase request on every page that carries an ad slot, including the home
 * page's first view (tests/home-request-budget.spec.ts caps it at 4), for a
 * setting that changes when a partnership does. The status column now says
 * where the switch really is.
 */
export function AffiliatePartnersManager() {

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
          brand, rotating every 30 minutes. To turn a partner on or off, change its{' '}
          <code>isActive</code> flag in <code>src/lib/affiliateAds.ts</code> and deploy; there is no
          switch here because nothing on the site would read one.
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
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AFFILIATE_PARTNERS.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.name}</TableCell>
                <TableCell>
                  <a
                    href={partner.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {partner.affiliateUrl.replace(/^https?:\/\//, '').slice(0, 30)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
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
                  <Badge variant={partner.isActive ? 'default' : 'outline'}>
                    {partner.isActive ? 'Live' : 'Off'}
                  </Badge>
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
                <TableCell className="text-sm text-muted-foreground">Off</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
