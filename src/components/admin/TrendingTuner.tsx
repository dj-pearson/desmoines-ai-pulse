import { useEffect, useMemo, useState } from "react";
import { Flame, History, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TrendingConfig {
  view_weight: number;
  favorite_weight: number;
  share_weight: number;
  click_weight: number;
  recency_half_life_hours: number;
  min_age_hours: number;
  featured_boost: number;
}

interface HistoryRow extends TrendingConfig {
  id: number;
  changed_by: string | null;
  changed_at: string;
}

const DEFAULTS: TrendingConfig = {
  view_weight: 1.0,
  favorite_weight: 5.0,
  share_weight: 3.0,
  click_weight: 2.0,
  recency_half_life_hours: 24.0,
  min_age_hours: 0.0,
  featured_boost: 10.0,
};

interface SliderControl {
  key: keyof TrendingConfig;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

const CONTROLS: SliderControl[] = [
  {
    key: "view_weight",
    label: "View weight",
    description: "Score added per page view",
    min: 0,
    max: 10,
    step: 0.1,
  },
  {
    key: "favorite_weight",
    label: "Favorite weight",
    description: "Score added per favorite",
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    key: "share_weight",
    label: "Share weight",
    description: "Score added per share",
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    key: "click_weight",
    label: "Click weight",
    description: "Score added per outbound click",
    min: 0,
    max: 15,
    step: 0.5,
  },
  {
    key: "recency_half_life_hours",
    label: "Recency half-life (hours)",
    description: "Score halves every N hours of age",
    min: 1,
    max: 168,
    step: 1,
  },
  {
    key: "min_age_hours",
    label: "Minimum age (hours)",
    description: "Items younger than this are excluded",
    min: 0,
    max: 48,
    step: 1,
  },
  {
    key: "featured_boost",
    label: "Featured boost",
    description: "Flat score bonus for is_featured rows",
    min: 0,
    max: 50,
    step: 1,
  },
];

function approxEqual(a: TrendingConfig, b: TrendingConfig): boolean {
  for (const c of CONTROLS) {
    if (Math.abs(a[c.key] - b[c.key]) > 1e-6) return false;
  }
  return true;
}

export default function TrendingTuner() {
  const [persisted, setPersisted] = useState<TrendingConfig | null>(null);
  const [draft, setDraft] = useState<TrendingConfig>(DEFAULTS);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ data: cfg, error: cfgErr }, { data: hist, error: histErr }] =
        await Promise.all([
          supabase
            .from("trending_config")
            .select("*")
            .eq("id", 1)
            .maybeSingle(),
          supabase
            .from("trending_config_history")
            .select("*")
            .order("changed_at", { ascending: false })
            .limit(10),
        ]);
      if (cfgErr) throw cfgErr;
      if (histErr) throw histErr;
      const config: TrendingConfig = cfg
        ? {
            view_weight: Number(cfg.view_weight),
            favorite_weight: Number(cfg.favorite_weight),
            share_weight: Number(cfg.share_weight),
            click_weight: Number(cfg.click_weight),
            recency_half_life_hours: Number(cfg.recency_half_life_hours),
            min_age_hours: Number(cfg.min_age_hours),
            featured_boost: Number(cfg.featured_boost),
          }
        : DEFAULTS;
      setPersisted(config);
      setDraft(config);
      setHistory((hist ?? []) as unknown as HistoryRow[]);
    } catch (err) {
      handleError(err, { component: "TrendingTuner", action: "load" });
      toast.error("Failed to load trending config");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dirty = useMemo(() => {
    if (!persisted) return false;
    return !approxEqual(draft, persisted);
  }, [draft, persisted]);

  async function save() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("trending_config")
        .update({
          ...draft,
          updated_by: user.user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw error;
      toast.success("Trending config saved");
      await load();
    } catch (err) {
      handleError(err, { component: "TrendingTuner", action: "save" });
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    if (persisted) setDraft(persisted);
  }

  function loadDefaults() {
    setDraft(DEFAULTS);
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flame className="h-5 w-5" />
              Trending tuner
            </CardTitle>
            <CardDescription>
              Edits append to a history log. Note: calculate_trending_scores
              hasn't been rewired to read these weights yet; this UI captures
              intent until the SQL function is updated.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadDefaults}
              disabled={saving}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Defaults
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={resetDraft}
              disabled={!dirty || saving}
            >
              Revert
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {CONTROLS.map((c) => {
              const value = draft[c.key];
              const persistedValue = persisted ? persisted[c.key] : value;
              const changed = Math.abs(value - persistedValue) > 1e-6;
              return (
                <div key={c.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm">{c.label}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        value={value}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          setDraft((d) => ({ ...d, [c.key]: v }));
                        }}
                        className={cn(
                          "w-20 h-7 text-sm tabular-nums text-right",
                          changed && "border-amber-500",
                        )}
                      />
                    </div>
                  </div>
                  <Slider
                    value={[value]}
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, [c.key]: v[0] ?? 0 }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium mb-2">
            <History className="h-4 w-4" />
            Recent changes
          </h3>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : history.length === 0 ? (
            <div className="text-sm text-muted-foreground border rounded-md p-4">
              No history yet. The first save will start the log.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Changed at</TableHead>
                    <TableHead className="text-right">view</TableHead>
                    <TableHead className="text-right">fav</TableHead>
                    <TableHead className="text-right">share</TableHead>
                    <TableHead className="text-right">click</TableHead>
                    <TableHead className="text-right">decay</TableHead>
                    <TableHead className="text-right">min age</TableHead>
                    <TableHead className="text-right">boost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(h.changed_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.view_weight).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.favorite_weight).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.share_weight).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.click_weight).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.recency_half_life_hours).toFixed(0)}h
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.min_age_hours).toFixed(0)}h
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(h.featured_boost).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
