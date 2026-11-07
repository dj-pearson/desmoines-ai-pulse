import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { isRpcMissing } from "@/hooks/useMyBusinessClaims";
import { claimPageUrl, listingPath, outreachDraft, type ClaimableType } from "@/lib/claimOutreach";
import { cn } from "@/lib/utils";

interface UnclaimedRow {
  listing_id: string;
  name: string;
  slug: string | null;
  website: string | null;
  phone: string | null;
  views: number;
  pending_claims: number;
}

/**
 * Who to ask to claim their listing (growth roadmap #2), most-viewed first,
 * from list_unclaimed_listings_by_views (migration 20261102000005).
 *
 * This sends nothing. "Copy email" puts a short plain-text draft with the
 * claim link on the clipboard; a person decides who gets it and sends it from
 * their own mail. The figure in the draft is floored to tens, the same number
 * the claim page shows, so an owner who clicks through sees what they were told.
 */
export function UnclaimedListingsPanel() {
  const [type, setType] = useState<ClaimableType>("restaurant");
  const [copied, setCopied] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-unclaimed-listings", type],
    queryFn: async (): Promise<UnclaimedRow[] | "unavailable"> => {
      const { data, error } = await supabase.rpc("list_unclaimed_listings_by_views", {
        p_listing_type: type,
        p_days: 30,
        p_limit: 50,
      });
      if (error) {
        if (isRpcMissing(error)) return "unavailable";
        throw error;
      }
      return (data ?? []) as UnclaimedRow[];
    },
  });

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      // Clipboard blocked: the claim link is visible in the row to copy by hand.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unclaimed listings, most viewed</CardTitle>
        <CardDescription>
          Page views in the last 30 days, counting only visitors who allowed analytics cookies. Copy a claim link or a
          ready email and send it yourself; nothing here contacts anyone.
        </CardDescription>
        <div role="group" aria-label="Listing type" className="mt-2 inline-flex w-fit rounded-lg border p-0.5">
          {(["restaurant", "attraction"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cn(
                "min-h-9 rounded-md px-3 text-sm font-medium capitalize",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                type === t ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t}s
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div role="status" aria-label="Loading" className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : query.error ? (
          <ErrorState
            compact
            error={query.error}
            title="The list didn't load"
            description="Try again in a moment."
            onRetry={() => void query.refetch()}
          />
        ) : query.data === "unavailable" ? (
          <p className="text-sm text-muted-foreground">
            Apply migration 20261102000005 to see this list.
          </p>
        ) : !query.data || query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every open {type} has an owner. Nice.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead>Contact on the listing</TableHead>
                  <TableHead>Outreach</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((row) => {
                  const url = claimPageUrl(type, row.listing_id);
                  const draft = outreachDraft(row.name, row.views, url);
                  return (
                    <TableRow key={row.listing_id}>
                      <TableCell className="font-medium">
                        <Link
                          to={listingPath(type, row.listing_id, row.name, row.slug)}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.pending_claims > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {row.pending_claims} pending claim{row.pending_claims === 1 ? "" : "s"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.views.toLocaleString()}</TableCell>
                      <TableCell className="text-sm">
                        {row.website ? (
                          <a href={row.website} target="_blank" rel="noopener noreferrer" className="block truncate max-w-48 underline-offset-4 hover:underline">
                            {row.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                          </a>
                        ) : null}
                        {row.phone ? <span className="block text-muted-foreground">{row.phone}</span> : null}
                        {!row.website && !row.phone ? <span className="text-muted-foreground">None listed</span> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-9"
                            onClick={() => copy(`${row.listing_id}:link`, url)}
                          >
                            {copied === `${row.listing_id}:link` ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            )}
                            Claim link
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-9"
                            onClick={() => copy(`${row.listing_id}:mail`, `Subject: ${draft.subject}\n\n${draft.body}`)}
                          >
                            {copied === `${row.listing_id}:mail` ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Mail className="h-4 w-4" aria-hidden="true" />
                            )}
                            Copy email
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {copied ? "Copied to your clipboard." : ""}
        </p>
      </CardContent>
    </Card>
  );
}
