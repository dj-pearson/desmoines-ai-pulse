import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useHotelAffiliatePrograms } from "@/hooks/useHotelAffiliatePrograms";
import { handleError } from "@/lib/errorHandler";
import {
  AFFILIATE_NETWORKS,
  FALLBACK_BRAND,
  NETWORK_FIELDS,
  PROGRAM_STATUSES,
  buildAffiliateUrl,
  isProgramComplete,
  type AffiliateNetwork,
  type HotelAffiliateProgram,
} from "@/lib/hotelAffiliateLinks";
import { toast } from "sonner";

/** Sample destination used for the live link preview. */
const PREVIEW_DESTINATION =
  "https://www.example.com/des-moines/hotel?arrival=2026-09-01";

const NETWORK_LABELS: Record<AffiliateNetwork, string> = {
  impact: "impact.com",
  partnerize: "Partnerize",
  cj: "CJ Affiliate",
  awin: "Awin",
  sovrn: "Sovrn Commerce",
  custom: "Custom template",
};

const STATUS_LABELS: Record<string, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  approved: "Approved",
  rejected: "Rejected",
  paused: "Paused",
};

interface ProgramCardProps {
  program: HotelAffiliateProgram;
  hotelCount: number;
  withAffiliateUrl: number;
  onSave: (id: string, patch: Partial<HotelAffiliateProgram>) => Promise<void>;
}

function ProgramCard({
  program,
  hotelCount,
  withAffiliateUrl,
  onSave,
}: ProgramCardProps) {
  const [draft, setDraft] = useState<HotelAffiliateProgram>(program);
  const [saving, setSaving] = useState(false);

  const isFallback = program.brand_parent === FALLBACK_BRAND;
  const network = draft.network as AffiliateNetwork;
  const fields = NETWORK_FIELDS[network] ?? {};
  const complete = isProgramComplete(draft);
  const preview = buildAffiliateUrl(draft, PREVIEW_DESTINATION);
  const dirty = JSON.stringify(draft) !== JSON.stringify(program);

  function set<K extends keyof HotelAffiliateProgram>(
    key: K,
    value: HotelAffiliateProgram[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    if (draft.is_enabled && !complete) {
      toast.error(
        `Fill in every required ${NETWORK_LABELS[network]} field before enabling ${program.brand_parent}.`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(program.id, {
        network: draft.network,
        display_name: draft.display_name,
        account_id: draft.account_id,
        ad_id: draft.ad_id,
        campaign_id: draft.campaign_id,
        tracking_domain: draft.tracking_domain,
        link_template: draft.link_template,
        sub_id: draft.sub_id,
        is_enabled: draft.is_enabled,
        status: draft.status,
        signup_url: draft.signup_url,
        notes: draft.notes,
      });
      toast.success(
        draft.is_enabled
          ? `${program.brand_parent} enabled — affiliate links applied to ${hotelCount} hotel${hotelCount === 1 ? "" : "s"}.`
          : `${program.brand_parent} saved.`,
      );
    } catch (error) {
      handleError(error, {
        component: "HotelAffiliateProgramsManager",
        action: "saveProgram",
      });
      toast.error("Save failed. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={draft.is_enabled ? "border-emerald-500/50" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {isFallback ? "Fallback (all other brands)" : program.brand_parent}
              {draft.is_enabled && (
                <Badge className="bg-emerald-600 text-white border-0">
                  <Check className="mr-1 h-3 w-3" />
                  Live
                </Badge>
              )}
              <Badge variant="outline">
                {STATUS_LABELS[draft.status] ?? draft.status}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {isFallback
                ? "Applies to any hotel whose own brand has no enabled program."
                : `${hotelCount} active hotel${hotelCount === 1 ? "" : "s"} · ${withAffiliateUrl} currently linked`}
              {program.commission_notes ? ` · ${program.commission_notes}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {program.signup_url && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={program.signup_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`enabled-${program.id}`}
                className="text-xs text-muted-foreground"
              >
                Enabled
              </Label>
              <Switch
                id={`enabled-${program.id}`}
                checked={draft.is_enabled}
                onCheckedChange={(v) => set("is_enabled", v)}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {program.notes && (
          <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            {program.notes}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`network-${program.id}`}>Network</Label>
            <Select
              value={draft.network}
              onValueChange={(v) => set("network", v)}
            >
              <SelectTrigger id={`network-${program.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AFFILIATE_NETWORKS.map((n) => (
                  <SelectItem key={n} value={n}>
                    {NETWORK_LABELS[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`status-${program.id}`}>Application status</Label>
            <Select
              value={draft.status}
              onValueChange={(v) => set("status", v)}
            >
              <SelectTrigger id={`status-${program.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROGRAM_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(
            [
              "tracking_domain",
              "account_id",
              "ad_id",
              "campaign_id",
            ] as const
          ).map((field) => {
            const spec = fields[field];
            if (!spec) return null;
            return (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`${field}-${program.id}`}>
                  {spec.label}
                  {spec.required && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id={`${field}-${program.id}`}
                  value={draft[field] ?? ""}
                  onChange={(e) => set(field, e.target.value || null)}
                  placeholder={spec.hint}
                />
                <p className="text-xs text-muted-foreground">{spec.hint}</p>
              </div>
            );
          })}

          <div className="space-y-1.5">
            <Label htmlFor={`subid-${program.id}`}>Sub ID (tracking tag)</Label>
            <Input
              id={`subid-${program.id}`}
              value={draft.sub_id ?? ""}
              onChange={(e) => set("sub_id", e.target.value)}
              placeholder="desmoines-insider"
            />
            <p className="text-xs text-muted-foreground">
              Passed to the network so you can attribute revenue back to this
              site.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`display-${program.id}`}>
              Display name ("via …")
            </Label>
            <Input
              id={`display-${program.id}`}
              value={draft.display_name ?? ""}
              onChange={(e) => set("display_name", e.target.value || null)}
              placeholder={program.brand_parent}
            />
          </div>
        </div>

        {fields.link_template && (
          <div className="space-y-1.5">
            <Label htmlFor={`template-${program.id}`}>
              {fields.link_template.label}
              <span className="ml-1 text-destructive">*</span>
            </Label>
            <Textarea
              id={`template-${program.id}`}
              value={draft.link_template ?? ""}
              onChange={(e) => set("link_template", e.target.value || null)}
              placeholder="https://www.stay22.com/l/YOURID?address={destination_encoded}"
              rows={2}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {fields.link_template.hint}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            Preview
          </Label>
          {preview ? (
            <code className="block break-all rounded-md bg-muted p-3 text-xs">
              {preview}
            </code>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Missing required credentials — nothing will be generated for this
              brand yet.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(program)}
              disabled={saving}
            >
              Reset
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; apply to {isFallback ? "fallback" : program.brand_parent}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HotelAffiliateProgramsManager() {
  const { programs, coverage, isLoading, error, refetch, saveProgram } =
    useHotelAffiliatePrograms();

  const coverageByBrand = useMemo(
    () => new Map(coverage.map((c) => [c.brand, c])),
    [coverage],
  );

  const unmappedBrands = useMemo(() => {
    const known = new Set(programs.map((p) => p.brand_parent));
    return coverage.filter((c) => !known.has(c.brand));
  }, [coverage, programs]);

  const enabledCount = programs.filter((p) => p.is_enabled).length;
  const linkedHotels = coverage.reduce((n, c) => n + c.withAffiliateUrl, 0);
  const totalHotels = coverage.reduce((n, c) => n + c.hotelCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {error}
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hotel affiliate programs</CardTitle>
          <CardDescription>
            Enter a brand's affiliate credentials once and every hotel carrying
            that brand gets a tracked booking link automatically — including
            hotels added later. {enabledCount} of {programs.length} programs
            enabled · {linkedHotels} of {totalHotels} active hotels linked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            These links must point at the brand's <strong>booking</strong> site,
            not its loyalty-club signup page. On impact.com and Partnerize the
            default creative link goes to the rewards enrolment page — you have
            to deep link (the destination URL is filled in automatically here)
            for the click to land on the property and pay on the stay. Note that
            UTM parameters alone do not earn commission; only the network's
            redirect does.
          </p>
        </CardContent>
      </Card>

      {unmappedBrands.length > 0 && (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-2 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              These brands exist on hotels but have no program row:{" "}
              <strong>
                {unmappedBrands
                  .map((b) => `${b.brand} (${b.hotelCount})`)
                  .join(", ")}
              </strong>
              . They fall through to the fallback program.
            </span>
          </CardContent>
        </Card>
      )}

      {programs.map((program) => {
        const cov = coverageByBrand.get(program.brand_parent);
        return (
          <ProgramCard
            key={program.id}
            program={program}
            hotelCount={cov?.hotelCount ?? 0}
            withAffiliateUrl={cov?.withAffiliateUrl ?? 0}
            onSave={saveProgram}
          />
        );
      })}
    </div>
  );
}
