import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, GitMerge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  RECENT_MERGES_KEY,
  UNDO_SCOPE,
  errorText,
  mergeContent,
  suggestSurvivor,
} from "@/hooks/useContentMerges";
import { handleError } from "@/lib/errorHandler";

interface Pick {
  id: string;
  name: string;
  location: string | null;
}

function RestaurantPicker({
  label,
  value,
  exclude,
  onChange,
}: {
  label: string;
  value: Pick | null;
  exclude: string | null;
  onChange: (p: Pick | null) => void;
}) {
  const [term, setTerm] = useState("");
  const q = term.trim();
  const { data, isFetching } = useQuery({
    queryKey: ["manual-merge-search", q],
    enabled: q.length >= 2 && !value,
    queryFn: async (): Promise<Pick[]> => {
      const { data: rows, error } = await supabase
        .from("restaurants")
        .select("id, name, location")
        .eq("is_merged", false)
        .ilike("name", `%${q.replace(/[%_]/g, "")}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return (rows ?? []).map((r) => ({ id: r.id, name: r.name, location: r.location }));
    },
  });

  if (value) {
    return (
      <div className="rounded-md border p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-medium truncate">{value.name}</div>
          <div className="text-sm text-muted-foreground truncate">{value.location ?? value.id}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  const results = (data ?? []).filter((r) => r.id !== exclude);
  return (
    <div className="rounded-md border p-3">
      <label className="text-xs text-muted-foreground" htmlFor={`pick-${label}`}>{label}</label>
      <Input
        id={`pick-${label}`}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search restaurants by name"
        autoComplete="off"
      />
      {isFetching && <p className="text-xs text-muted-foreground mt-2">Searching...</p>}
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left rounded px-2 py-1 hover:bg-muted"
                onClick={() => onChange(r)}
              >
                <span className="font-medium">{r.name}</span>
                {r.location && <span className="text-sm text-muted-foreground"> - {r.location}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Merge two restaurants an admin picked, without waiting for the weekly scan. */
export function ManualMergeForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [a, setA] = useState<Pick | null>(null);
  const [b, setB] = useState<Pick | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestFailed, setSuggestFailed] = useState(false);

  // Ask the server which one its rule keeps; the admin can swap before merging.
  useEffect(() => {
    setKeepId(null);
    setSuggestFailed(false);
    if (!a || !b) return;
    let live = true;
    suggestSurvivor(a.id, b.id)
      .then((id) => { if (live) setKeepId(id); })
      .catch((e) => {
        handleError(e, { component: "ManualMergeForm", action: "suggest" });
        if (live) {
          setSuggestFailed(true);
          setKeepId(a.id);
        }
      });
    return () => { live = false; };
  }, [a, b]);

  const keep = keepId && a && b ? (keepId === a.id ? a : b) : null;
  const hide = keep && a && b ? (keep.id === a.id ? b : a) : null;

  const merge = async () => {
    if (!keep || !hide) return;
    setBusy(true);
    try {
      await mergeContent({ contentType: "restaurant", survivor: keep.id, loser: hide.id, confidence: null });
      toast({ title: "Merged", description: `${hide.name} was merged into ${keep.name}. ${UNDO_SCOPE}` });
      setA(null);
      setB(null);
      await queryClient.invalidateQueries({ queryKey: RECENT_MERGES_KEY });
      await queryClient.invalidateQueries({ queryKey: ["merge-review-queue"] });
    } catch (e) {
      handleError(e, { component: "ManualMergeForm", action: "merge" });
      toast({ title: "Merge failed", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="manual-merge-heading" className="mt-8">
      <h3 id="manual-merge-heading" className="text-base font-semibold">Merge two restaurants</h3>
      <p className="text-sm text-muted-foreground mb-3 max-w-prose">
        For a duplicate the weekly scan missed. The kept listing takes any details it is missing from the other one,
        and the other one's owner claims move with it.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RestaurantPicker label="First restaurant" value={a} exclude={b?.id ?? null} onChange={setA} />
        <RestaurantPicker label="Second restaurant" value={b} exclude={a?.id ?? null} onChange={setB} />
      </div>
      {keep && hide && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm">
            Keep <strong>{keep.name}</strong>, hide <strong>{hide.name}</strong>.
            {suggestFailed && " The suggested choice could not be loaded, so check this before merging."}
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setKeepId(hide.id)}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />Swap which to keep
          </Button>
          <Button size="sm" disabled={busy} onClick={merge}>
            <GitMerge className="h-4 w-4 mr-1" />{busy ? "Merging..." : "Merge"}
          </Button>
        </div>
      )}
    </section>
  );
}
