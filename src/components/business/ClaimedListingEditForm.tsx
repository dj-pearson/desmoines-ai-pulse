import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  OWNER_EDITABLE_FIELDS,
  isRpcMissing,
  useUpdateClaimedListing,
  type OwnerEditableField,
} from "@/hooks/useMyBusinessClaims";
import type { ListingType } from "@/hooks/useBusinessClaim";
import { handleError } from "@/lib/errorHandler";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

export interface ClaimedListingEditFormProps {
  listingType: ListingType;
  listingId: string;
  listingName: string;
  initialValues: Partial<Record<OwnerEditableField, string | null>>;
  onSaved?: () => void;
}

const FIELD_META: Record<
  OwnerEditableField,
  { label: string; hint?: string; type: "text" | "url" | "tel" | "textarea"; autoComplete?: string }
> = {
  description: { label: "Description", hint: "Up to 2,000 characters.", type: "textarea" },
  website: { label: "Website", hint: "Starts with https://", type: "url", autoComplete: "url" },
  phone: { label: "Phone", type: "tel", autoComplete: "tel" },
  image_url: { label: "Photo link", hint: "A direct link to a photo, starting with https://", type: "url" },
  menu_url: { label: "Menu link", hint: "Starts with https://", type: "url" },
};

const httpUrl = z
  .string()
  .trim()
  .max(500, "Keep links under 500 characters.")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full link starting with https://");

const FIELD_SCHEMA: Record<OwnerEditableField, z.ZodTypeAny> = {
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters."),
  website: httpUrl,
  phone: z
    .string()
    .trim()
    .max(40, "That phone number is too long.")
    .refine((v) => v === "" || /^[0-9+().\-\s]{7,}$/.test(v), "Use digits, spaces, dashes or brackets."),
  image_url: httpUrl,
  menu_url: httpUrl,
};

type FormValues = Partial<Record<OwnerEditableField, string>>;

/**
 * Owner edits for a verified claim (business plan WP3 item 3).
 *
 * Sends only the fields that changed, and only the type's whitelisted ones:
 * update_claimed_listing refuses any other key by name, and a changed-only
 * patch means saving the phone number doesn't rewrite the description with
 * what the form happened to load.
 *
 * Before 20260920000005 is applied the RPC answers PGRST202. That hides the
 * form behind one sentence rather than letting every save fail.
 */
export function ClaimedListingEditForm({
  listingType,
  listingId,
  listingName,
  initialValues,
  onSaved,
}: ClaimedListingEditFormProps) {
  const fields = OWNER_EDITABLE_FIELDS[listingType] as readonly OwnerEditableField[];
  const schema = z.object(
    Object.fromEntries(fields.map((f) => [f, FIELD_SCHEMA[f]])) as Record<string, z.ZodTypeAny>,
  );
  const defaults: FormValues = Object.fromEntries(
    fields.map((f) => [f, initialValues[f] ?? ""]),
  ) as FormValues;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const update = useUpdateClaimedListing();
  const [notSwitchedOn, setNotSwitchedOn] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (notSwitchedOn) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Editing opens once claims are switched on. Until then, email{" "}
        <a href={BUSINESS_CONTACT_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
          {BUSINESS_CONTACT_EMAIL}
        </a>{" "}
        with the change and we'll make it by hand.
      </p>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    // Compared against what the form loaded (or last saved), not formState's
    // dirtyFields: that proxy only tracks fields read during render.
    const saved = form.formState.defaultValues ?? {};
    const patch: Partial<Record<OwnerEditableField, string | null>> = {};
    for (const field of fields) {
      const value = (values[field] ?? "").trim();
      if (value === (saved[field] ?? "").trim()) continue;
      patch[field] = value === "" ? null : value;
    }
    if (Object.keys(patch).length === 0) {
      setServerError("Nothing has changed yet.");
      return;
    }

    try {
      await update.mutateAsync({ listingType, listingId, patch });
      form.reset(values);
      toast.success(`${listingName} is updated.`);
      onSaved?.();
    } catch (error) {
      if (isRpcMissing(error)) {
        setNotSwitchedOn(true);
        return;
      }
      handleError(error, { component: "ClaimedListingEditForm", action: "update_claimed_listing" });
      // The function's own refusal names the problem ("you have not verified
      // this listing"), so it is shown rather than a generic line.
      const message =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message.replace(/^update_claimed_listing:\s*/, "")
          : "";
      setServerError(message ? `That didn't save: ${message}.` : "That didn't save. Try again.");
    }
  });

  const idFor = (field: OwnerEditableField) => `claim-${listingId}-${field}`;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label={`Edit ${listingName}`}>
      {fields.map((field) => {
        const meta = FIELD_META[field];
        const error = form.formState.errors[field]?.message;
        const hintId = meta.hint ? `${idFor(field)}-hint` : undefined;
        const errorId = error ? `${idFor(field)}-error` : undefined;
        const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
        return (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={idFor(field)}>{meta.label}</Label>
            {meta.type === "textarea" ? (
              <Textarea
                id={idFor(field)}
                rows={5}
                aria-invalid={!!error}
                aria-describedby={describedBy}
                {...form.register(field)}
              />
            ) : (
              <Input
                id={idFor(field)}
                type={meta.type}
                inputMode={meta.type === "tel" ? "tel" : meta.type === "url" ? "url" : undefined}
                autoComplete={meta.autoComplete}
                className="min-h-11"
                aria-invalid={!!error}
                aria-describedby={describedBy}
                {...form.register(field)}
              />
            )}
            {meta.hint && (
              <p id={hintId} className="text-xs text-muted-foreground">
                {meta.hint}
              </p>
            )}
            {error && (
              <p id={errorId} className="text-sm text-destructive">
                {String(error)}
              </p>
            )}
          </div>
        );
      })}

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11" disabled={update.isPending} aria-busy={update.isPending}>
          {update.isPending ? "Saving..." : "Save changes"}
        </Button>
        <p className="text-xs text-muted-foreground">Changes go live without review.</p>
      </div>
    </form>
  );
}
