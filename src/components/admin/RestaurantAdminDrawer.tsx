import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RestaurantChangeList } from "@/components/admin/RestaurantChangeHistory";
import { handleError } from "@/lib/errorHandler";
import { toast } from "@/lib/toast";
import {
  RESTAURANT_STATUSES,
  adminHoursJson,
  fetchRestaurantAdminDetail,
  formatCheckedAt,
  hideRestaurant,
  hoursEditorText,
  reopenPatch,
  saveRestaurantAdminPatch,
  unhideRestaurant,
  type AdminRestaurantDetail,
  type AdminRestaurantPatch,
  type Part,
} from "@/lib/restaurantAdmin";

interface RestaurantAdminDrawerProps {
  restaurantId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after any write, so the table refreshes. */
  onChanged: () => void;
  /** Opens the full content editor (ContentEditDialog) for the other fields. */
  onEditContent: (row: AdminRestaurantDetail) => void;
}

const restaurantAdminDetailKey = (id: string | null) => ["restaurant-admin-detail", id] as const;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function PartList<T>({ part, empty, render }: { part: Part<T>; empty: string; render: (row: T) => React.ReactNode }) {
  // `in`, not `!part.ok`: without strictNullChecks a boolean discriminant does not narrow.
  if ("error" in part) return <p className="text-sm text-destructive">Could not load: {part.error}</p>;
  if (part.rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="space-y-1 text-sm">{part.rows.map(render)}</ul>;
}

const isClosed = (r: AdminRestaurantDetail) =>
  r.status === "closed" ||
  r.business_status === "CLOSED_PERMANENTLY" ||
  r.business_status === "CLOSED_TEMPORARILY";

/**
 * WEB-FEAT-103: one restaurant as the automation sees it, and the fields an
 * admin corrects when automation is wrong. Every edit here is saved as an
 * admin's edit (WEB-BE-069), so Google enrichment leaves it alone.
 */
export function RestaurantAdminDrawer({ restaurantId, onOpenChange, onChanged, onEditContent }: RestaurantAdminDrawerProps) {
  const queryClient = useQueryClient();
  const formId = useId();
  const detail = useQuery({
    queryKey: restaurantAdminDetailKey(restaurantId),
    queryFn: () => fetchRestaurantAdminDetail(restaurantId as string),
    enabled: Boolean(restaurantId),
    staleTime: 0,
  });
  const row = detail.data?.row ?? null;

  const [status, setStatus] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [reservationUrl, setReservationUrl] = useState("");
  const [hoursText, setHoursText] = useState("");
  const [hideReason, setHideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setStatus(row.status ?? "open");
    setPlaceId(row.google_place_id ?? "");
    setReservationUrl(row.reservation_url ?? "");
    setHoursText(hoursEditorText(row));
    setHideReason("");
    setFormError(null);
  }, [row]);

  const afterWrite = async () => {
    await queryClient.invalidateQueries({ queryKey: restaurantAdminDetailKey(restaurantId) });
    await queryClient.invalidateQueries({ queryKey: ["restaurant-changes", restaurantId] });
    onChanged();
  };

  const save = async (patch: AdminRestaurantPatch, done: string) => {
    if (!row) return;
    setBusy(true);
    setFormError(null);
    try {
      const { lockError } = await saveRestaurantAdminPatch(row.id, patch);
      if (lockError) toast.warning(`${done}, but it is not protected from Google enrichment: ${lockError}`);
      else toast.success(done);
      await afterWrite();
    } catch (e) {
      handleError(e, { component: "RestaurantAdminDrawer", action: "save" });
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveFields = () => {
    if (!row) return;
    const patch: AdminRestaurantPatch = {};
    if (status && status !== (row.status ?? "")) patch.status = status;
    const pid = placeId.trim() || null;
    if (pid !== (row.google_place_id ?? null)) patch.google_place_id = pid;
    const res = reservationUrl.trim() || null;
    if (res && !/^https?:\/\//i.test(res)) {
      setFormError("The reservation link must start with http:// or https://");
      return;
    }
    if (res !== (row.reservation_url ?? null)) patch.reservation_url = res;
    if (hoursText.trim() !== hoursEditorText(row).trim()) {
      const hours = adminHoursJson(hoursText);
      if ("error" in hours) {
        setFormError(hours.error);
        return;
      }
      patch.hours_json = hours.hours;
    }
    if (Object.keys(patch).length === 0) {
      setFormError("Nothing has changed yet.");
      return;
    }
    void save(patch, "Saved");
  };

  const toggleHidden = async () => {
    if (!row) return;
    setBusy(true);
    setFormError(null);
    try {
      if (row.hidden_at) {
        await unhideRestaurant(row.id);
        toast.success(`${row.name} is listed again`);
      } else {
        await hideRestaurant(row.id, hideReason);
        toast.success(`${row.name} is hidden`);
      }
      await afterWrite();
    } catch (e) {
      handleError(e, { component: "RestaurantAdminDrawer", action: row.hidden_at ? "unhide" : "hide" });
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(restaurantId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{row?.name ?? "Restaurant"}</SheetTitle>
          <SheetDescription>What automation knows about this listing, and the fields you can correct.</SheetDescription>
        </SheetHeader>

        {detail.isLoading && <Skeleton className="mt-6 h-64 w-full" />}
        {detail.error && (
          <p role="alert" className="mt-6 text-sm text-destructive">
            Could not load this restaurant: {detail.error instanceof Error ? detail.error.message : String(detail.error)}
          </p>
        )}
        {detail.data && !row && <p className="mt-6 text-sm">No restaurant has this id.</p>}

        {row && detail.data && (
          <div className="mt-6 space-y-6">
            <section aria-labelledby={`${formId}-facts`}>
              <h3 id={`${formId}-facts`} className="mb-2 font-semibold">Listing</h3>
              <dl className="space-y-1">
                <Fact label="Status">{row.status ?? "none"}{row.status_changed_by ? ` (set by ${row.status_changed_by})` : ""}</Fact>
                <Fact label="Google status">{row.business_status ?? "none"}</Fact>
                <Fact label="Place id">{row.google_place_id ?? "none"}</Fact>
                <Fact label="Last Places check">{formatCheckedAt(row.hours_checked_at)}</Fact>
                {"place_lookup_checked_at" in row && (
                  <Fact label="Last place lookup">{formatCheckedAt(row.place_lookup_checked_at)}</Fact>
                )}
                <Fact label="Hours">
                  {hoursEditorText(row) ? <span className="whitespace-pre-line">{hoursEditorText(row)}</span> : "none"}
                </Fact>
                <Fact label="Visibility">
                  {row.hidden_at ? `Hidden ${formatCheckedAt(row.hidden_at)}${row.hidden_reason ? `: ${row.hidden_reason}` : ""}` : "Listed"}
                </Fact>
                <Fact label="Merge">
                  {row.is_merged ? `Merged into ${row.merged_into ?? "unknown"}` : "Not merged"}
                </Fact>
              </dl>
              {row.slug && !row.hidden_at && (
                <Link className="mt-2 inline-block text-sm underline" to={`/restaurants/${row.slug}`}>
                  View public page
                </Link>
              )}
            </section>

            <section aria-labelledby={`${formId}-claims`}>
              <h3 id={`${formId}-claims`} className="mb-2 font-semibold">Claims</h3>
              <PartList
                part={detail.data.claims}
                empty="Nobody has claimed this listing."
                render={(c) => (
                  <li key={c.id}>
                    {c.status}, {formatCheckedAt(c.verified_at ?? c.created_at)}
                  </li>
                )}
              />
            </section>

            <section aria-labelledby={`${formId}-merges`}>
              <h3 id={`${formId}-merges`} className="mb-2 font-semibold">Merges</h3>
              <PartList
                part={detail.data.merges}
                empty="No merges involve this listing."
                render={(m) => (
                  <li key={m.id}>
                    {m.loser_id === row.id ? "Merged into another listing" : "Another listing merged into this one"},{" "}
                    {formatCheckedAt(m.created_at)}
                    {m.reversed ? " (undone)" : ""}
                  </li>
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">Undo a merge from the Duplicates tab.</p>
            </section>

            <section aria-labelledby={`${formId}-closures`}>
              <h3 id={`${formId}-closures`} className="mb-2 font-semibold">Open closure reviews</h3>
              <PartList
                part={detail.data.closureReviews}
                empty="None open."
                render={(r) => (
                  <li key={r.id}>
                    {r.reason.replace(/_/g, " ")}, {formatCheckedAt(r.created_at)}
                  </li>
                )}
              />
              <Link className="mt-1 inline-block text-sm underline" to="/admin/closure-reviews">
                Closure review queue
              </Link>
            </section>

            <section aria-labelledby={`${formId}-edit`} className="space-y-3">
              <h3 id={`${formId}-edit`} className="font-semibold">Correct</h3>
              <p className="text-xs text-muted-foreground">Saved as an admin's edit: Google enrichment will not overwrite these.</p>
              <div className="space-y-1">
                <Label htmlFor={`${formId}-status`}>Status</Label>
                <select
                  id={`${formId}-status`}
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {RESTAURANT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${formId}-place`}>Google place id</Label>
                <Input id={`${formId}-place`} value={placeId} onChange={(e) => setPlaceId(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${formId}-res`}>Reservation link</Label>
                <Input
                  id={`${formId}-res`}
                  type="url"
                  inputMode="url"
                  value={reservationUrl}
                  onChange={(e) => setReservationUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${formId}-hours`}>Hours, one line per day</Label>
                <Textarea
                  id={`${formId}-hours`}
                  rows={7}
                  placeholder={"Monday: 11 AM - 9 PM\nSunday: Closed"}
                  value={hoursText}
                  onChange={(e) => setHoursText(e.target.value)}
                />
              </div>
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="min-h-11" disabled={busy} onClick={saveFields}>
                  Save corrections
                </Button>
                {isClosed(row) && (
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(reopenPatch(), "Reopened")}>
                    Reopen
                  </Button>
                )}
                <Button type="button" variant="outline" className="min-h-11" onClick={() => onEditContent(row)}>
                  Edit description, photos and more
                </Button>
              </div>
            </section>

            <section aria-labelledby={`${formId}-hide`} className="space-y-2">
              <h3 id={`${formId}-hide`} className="font-semibold">{row.hidden_at ? "Hidden" : "Hide this listing"}</h3>
              {row.hidden_at ? (
                <p className="text-sm text-muted-foreground">
                  Visitors see that the listing was removed. Its name and place id are on the do-not-ingest list.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The row is kept. Its page says the listing was removed, and its name and place id go on the do-not-ingest
                    list so no scraper or Places search adds it back.
                  </p>
                  <Label htmlFor={`${formId}-reason`}>Reason (optional)</Label>
                  <Input id={`${formId}-reason`} value={hideReason} onChange={(e) => setHideReason(e.target.value)} />
                </>
              )}
              <Button
                type="button"
                variant={row.hidden_at ? "outline" : "destructive"}
                className="min-h-11"
                disabled={busy}
                onClick={() => void toggleHidden()}
              >
                {row.hidden_at ? "Unhide listing" : "Hide listing"}
              </Button>
            </section>

            <section aria-labelledby={`${formId}-history`}>
              <h3 id={`${formId}-history`} className="mb-2 font-semibold">Change history</h3>
              <RestaurantChangeList restaurantId={row.id} />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
