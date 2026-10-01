import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { createLogger } from "@/lib/logger";
import { toast } from "sonner";
import { BadgeCheck, Building2, ExternalLink, X } from "lucide-react";

const log = createLogger("BusinessClaimsManager");

/**
 * The queue for claims that could not verify themselves (WEB-ADS-009 AC5).
 *
 * MOST CLAIMS LAND HERE AND THAT IS BY DESIGN. Verification is an email-domain
 * match against the website already on the listing, so a business on a gmail
 * address - which is most of them - cannot auto-verify. A queue nobody watches
 * would make the claim button a form that goes nowhere, which is the shape
 * WEB-ADS-006 and WEB-ADS-008 were both about.
 *
 * Approving is what grants the owner-scoped edit, so the listing's own website
 * and the claimant's email are shown side by side: those two strings are the
 * whole of the decision a human is being asked to make.
 */

type ClaimStatus = "pending" | "verified" | "rejected";

interface ClaimRow {
  id: string;
  listing_type: "restaurant" | "attraction" | "venue";
  listing_id: string;
  user_id: string;
  status: ClaimStatus;
  claimed_email: string | null;
  matched_domain: string | null;
  admin_notes: string | null;
  created_at: string;
}

const LISTING_PATH: Record<ClaimRow["listing_type"], string> = {
  restaurant: "/restaurants",
  attraction: "/attractions",
  venue: "/venues",
};

export default function BusinessClaimsManager() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [websites, setWebsites] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_claims" as never)
        .select("id, listing_type, listing_id, user_id, status, claimed_email, matched_domain, admin_notes, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      // 42P01 until 20260920000005 is applied. Surfaced rather than swallowed:
      // an empty queue and a missing table look identical and mean opposite
      // things.
      if (error) throw error;
      const rows = (data ?? []) as unknown as ClaimRow[];
      setClaims(rows);

      // The listing's website is the evidence the decision turns on, so it is
      // fetched per type rather than left for the reviewer to go and look up.
      const sites: Record<string, string | null> = {};
      for (const type of ["restaurant", "attraction", "venue"] as const) {
        const ids = rows.filter((r) => r.listing_type === type).map((r) => r.listing_id);
        if (ids.length === 0) continue;
        const table = type === "restaurant" ? "restaurants" : type === "attraction" ? "attractions" : "known_venues";
        const { data: listings, error: listingError } = await supabase
          .from(table)
          .select("id, name, website")
          .in("id", ids);
        if (listingError) {
          log.warn("load", `could not read ${table}`, { data: listingError });
          continue;
        }
        for (const l of (listings ?? []) as unknown as { id: string; name: string; website: string | null }[]) {
          sites[`${type}:${l.id}`] = l.website ?? null;
          sites[`${type}:${l.id}:name`] = l.name;
        }
      }
      setWebsites(sites);
    } catch (err) {
      handleError(err, { component: "BusinessClaimsManager", action: "load" });
      toast.error("Could not load the claims queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(claim: ClaimRow, approve: boolean) {
    setBusyId(claim.id);
    try {
      const { error } = await supabase.rpc("review_business_claim" as never, {
        p_claim_id: claim.id,
        p_approve: approve,
        p_notes: notes[claim.id] ?? null,
      } as never);
      if (error) throw new Error(error.message);
      toast.success(approve ? "Claim approved" : "Claim rejected");
      await load();
    } catch (err) {
      // The function is admin-gated and refuses out loud; that message is the
      // useful one.
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Business claims</h1>
        <p className="text-sm text-muted-foreground">
          Claims whose email domain did not match the website on the listing. Approving grants the
          claimant edit rights to that listing&apos;s description, website, phone and photo.
        </p>
      </div>

      {claims.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No claims are waiting.
          </CardContent>
        </Card>
      ) : (
        claims.map((claim) => {
          const key = `${claim.listing_type}:${claim.listing_id}`;
          const site = websites[key];
          const name = websites[`${key}:name`] ?? claim.listing_id;
          return (
            <Card key={claim.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {name}
                  </CardTitle>
                  <Badge variant="outline">{claim.listing_type}</Badge>
                </div>
                <CardDescription>
                  Claimed {new Date(claim.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* The two strings the decision turns on, next to each other. */}
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Claimant email</dt>
                    <dd className="font-mono text-xs">{claim.claimed_email ?? "(none on file)"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Website on the listing</dt>
                    <dd className="font-mono text-xs">
                      {site ? (
                        <a href={site} target="_blank" rel="noopener noreferrer" className="underline">
                          {site}
                        </a>
                      ) : (
                        "(none)"
                      )}
                    </dd>
                  </div>
                </dl>

                <Button variant="outline" size="sm" asChild>
                  <a href={`${LISTING_PATH[claim.listing_type]}/${claim.listing_id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open the listing
                  </a>
                </Button>

                <Textarea
                  placeholder="Notes for the record (optional)"
                  value={notes[claim.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [claim.id]: e.target.value }))}
                  rows={2}
                />

                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === claim.id} onClick={() => review(claim, true)}>
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === claim.id}
                    onClick={() => review(claim, false)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
