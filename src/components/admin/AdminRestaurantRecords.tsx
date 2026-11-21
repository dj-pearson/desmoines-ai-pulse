import { useEffect, useId, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RestaurantAdminDrawer } from "@/components/admin/RestaurantAdminDrawer";
import {
  ADMIN_PAGE_SIZE,
  ADMIN_RESTAURANT_FILTERS,
  ADMIN_RESTAURANT_SORTS,
  fetchAdminRestaurants,
  formatCheckedAt,
  type AdminRestaurantDetail,
  type AdminRestaurantFilter,
  type AdminRestaurantRow,
  type AdminRestaurantSort,
  type ClaimState,
} from "@/lib/restaurantAdmin";

interface AdminRestaurantRecordsProps {
  /** Opens ContentEditDialog for a row. */
  onEditContent: (row: AdminRestaurantDetail) => void;
}

function StateBadges({ row, claim }: { row: AdminRestaurantRow; claim: ClaimState | undefined }) {
  const out: string[] = [];
  if (row.hidden_at) out.push("Hidden");
  if (row.is_merged) out.push("Merged");
  if (claim === "verified") out.push("Claimed");
  if (claim === "pending") out.push("Claim pending");
  if (!row.google_place_id) out.push("No place id");
  if (out.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {out.map((s) => (
        <Badge key={s} variant={s === "Hidden" ? "destructive" : "outline"}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

/**
 * WEB-FEAT-103: the admin restaurant table, sorted and filtered on the fields
 * automation depends on. Filtering and sorting happen in the query, so the
 * count and the pages agree. A row opens the drawer.
 */
export function AdminRestaurantRecords({ onEditContent }: AdminRestaurantRecordsProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AdminRestaurantFilter>("listed");
  const [sort, setSort] = useState<AdminRestaurantSort>("checked_oldest");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setPage(0), [filter, sort, search]);

  const list = useQuery({
    queryKey: ["admin-restaurant-records", filter, sort, search, page],
    queryFn: () => fetchAdminRestaurants({ filter, sort, search, page }),
    placeholderData: keepPreviousData,
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold">Restaurant records</h2>
        <p className="text-sm text-muted-foreground">
          Place id, Google status, the last Places check, claims and merges. Open a row to correct it or hide it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-show`}>Show</Label>
          <select
            id={`${id}-show`}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as AdminRestaurantFilter)}
          >
            {ADMIN_RESTAURANT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-sort`}>Sort by</Label>
          <select
            id={`${id}-sort`}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as AdminRestaurantSort)}
          >
            {ADMIN_RESTAURANT_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`${id}-search`}>Name</Label>
          <Input id={`${id}-search`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name" />
        </div>
      </div>

      {list.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load restaurants: {list.error instanceof Error ? list.error.message : String(list.error)}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {list.isLoading ? "Loading..." : `${total} restaurant${total === 1 ? "" : "s"}`}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Google</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data?.rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.location ? <div className="text-xs text-muted-foreground">{r.location}</div> : null}
                    </TableCell>
                    <TableCell>{r.status ?? "none"}</TableCell>
                    <TableCell>{r.business_status ?? "none"}</TableCell>
                    <TableCell>{formatCheckedAt(r.hours_checked_at)}</TableCell>
                    <TableCell>
                      <StateBadges row={r} claim={list.data?.claims[r.id]} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOpenId(r.id)} aria-label={`Open ${r.name}`}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {list.data && list.data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No restaurants match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="min-h-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm">
                Page {page + 1} of {pages}
              </span>
              <Button variant="outline" className="min-h-11" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <RestaurantAdminDrawer
        restaurantId={openId}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        // Every cached view, not only this one: a hide moves the row from
        // Listed to Hidden, and both may be cached.
        onChanged={() => void queryClient.invalidateQueries({ queryKey: ["admin-restaurant-records"] })}
        onEditContent={(row) => {
          setOpenId(null);
          onEditContent(row);
        }}
      />
    </section>
  );
}
