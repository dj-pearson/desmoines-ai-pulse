import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { notifyBusinessClaimDecision, type ClaimDecision } from "@/lib/businessClaimNotify";
import { handleError } from "@/lib/errorHandler";
import { createLogger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { BadgeCheck, Building2, ExternalLink, UserX, X } from "lucide-react";

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
 *
 * WEB-ADS-047 added what happens after the decision: the claimant is emailed
 * (notify-business-claim, after the RPC commits), and a Verified tab lists the
 * current owners with Revoke, which needs a reason and records who and why
 * (revoke_business_claim). The admin's notes and the reason stay internal;
 * the email is fixed copy.
 */

type Tab = "pending" | "verified";

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
  method: string | null;
  verified_at: string | null;
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
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("business_claims" as never)
        .select("id, listing_type, listing_id, user_id, status, claimed_email, matched_domain, admin_notes, method, verified_at, created_at")
        .eq("status", tab)
        .order(tab === "pending" ? "created_at" : "verified_at", { ascending: tab === "pending" });

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
      toast.error(tab === "pending" ? "Could not load the claims queue" : "Could not load the verified owners");
    } finally {
      setLoading(false);
    }
  }, [tab]);

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
      await tellClaimant(claim.id, approve ? "approved" : "rejected", approve ? "Claim approved" : "Claim rejected");
      await load();
    } catch (err) {
      // The function is admin-gated and refuses out loud; that message is the
      // useful one.
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusyId(null);
    }
  }

  async function tellClaimant(claimId: string, decision: ClaimDecision, done: string) {
    const sent = await notifyBusinessClaimDecision(claimId, decision);
    if (sent) toast.success(`${done}. The claimant was emailed.`);
    else toast.warning(`${done}, but the email to the claimant did not go out. Contact them directly.`);
  }

  async function revoke(claim: ClaimRow) {
    const reason = (reasons[claim.id] ?? "").trim();
    if (!reason) return;
    setBusyId(claim.id);
    try {
      const { error } = await supabase.rpc("revoke_business_claim" as never, {
        p_claim_id: claim.id,
        p_reason: reason,
      } as never);
      if (error) throw new Error(error.message);
      await tellClaimant(claim.id, "revoked", "Owner removed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusyId(null);
    }
  }

  const list = loading ? (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : tab === "verified" ? (
    claims.length === 0 ? (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No listing has a verified owner.
        </CardContent>
      </Card>
    ) : (
      claims.map((claim) => {
        const key = `${claim.listing_type}:${claim.listing_id}`;
        const name = websites[`${key}:name`] ?? claim.listing_id;
        const reason = reasons[claim.id] ?? "";
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
                Verified {claim.verified_at ? new Date(claim.verified_at).toLocaleDateString() : "(date unknown)"}
                {claim.method === "admin" ? " by an admin" : claim.matched_domain ? ` by email domain ${claim.matched_domain}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="text-sm">
                <dt className="text-muted-foreground">Owner email</dt>
                <dd className="font-mono text-xs">{claim.claimed_email ?? "(none on file)"}</dd>
              </dl>
              <Textarea
                aria-label={`Reason for removing the owner of ${name}`}
                placeholder="Why is this owner being removed? Required, kept for the record, not emailed."
                value={reason}
                onChange={(e) => setReasons((r) => ({ ...r, [claim.id]: e.target.value }))}
                rows={2}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={busyId === claim.id || reason.trim() === ""}
                onClick={() => revoke(claim)}
              >
                <UserX className="mr-1 h-3.5 w-3.5" />
                Revoke
              </Button>
            </CardContent>
          </Card>
        );
      })
    )
  ) : claims.length === 0 ? (
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
                  aria-label={`Notes on the claim for ${name}`}
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
      );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Business claims</h1>
        <p className="text-sm text-muted-foreground">
          Pending claims are those whose email domain did not match the website on the listing.
          Approving grants the claimant edit rights to that listing&apos;s description, website, phone
          and photo. The claimant is emailed when a claim is approved, rejected or revoked; your notes
          are not included.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="verified">Verified owners</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="space-y-4">
          {tab === "pending" && list}
        </TabsContent>
        <TabsContent value="verified" className="space-y-4">
          {tab === "verified" && list}
        </TabsContent>
      </Tabs>
    </div>
  );
}
