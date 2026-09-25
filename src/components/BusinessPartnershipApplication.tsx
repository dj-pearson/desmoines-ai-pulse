import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  BUSINESS_TYPES,
  PARTNERSHIP_TIERS,
  applicationStatusLabel,
  businessTypeLabel,
  usePartnershipApplications,
  useSubmitPartnershipApplication,
  type PartnershipTier,
} from "@/hooks/useBusinessPartnership";

const TIER_LABEL: Record<PartnershipTier, string> = {
  basic: "Basic",
  premium: "Premium",
  enterprise: "Enterprise",
};

const schema = z.object({
  business_name: z.string().trim().min(1, "Enter your business name.").max(200),
  business_type: z.string().min(1),
  contact_email: z.string().trim().email("Enter an email we can reply to."),
  contact_phone: z.string().trim().max(40).optional(),
  website: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full link starting with https://")
    .optional(),
  description: z.string().trim().max(2000, "Keep it under 2,000 characters.").optional(),
  desired_tier: z.enum(PARTNERSHIP_TIERS),
});

type FormValues = z.infer<typeof schema>;

/**
 * The partnership application, for signed-in users.
 *
 * The tiers carry no price and no feature list. Whether partnership has a
 * price at all is an open decision (business plan D16), and the old
 * partnership_benefits rows promised messaging, review tools and analytics
 * that nothing implements. So a tier is a preference we talk through by email,
 * and the page says so.
 */
export function BusinessPartnershipApplication() {
  const { user } = useAuth();
  const applications = usePartnershipApplications();
  const submit = useSubmitPartnershipApplication();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: "",
      business_type: "restaurant",
      contact_email: user?.email ?? "",
      contact_phone: "",
      website: "",
      description: "",
      desired_tier: "basic",
    },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await submit.mutateAsync({
        business_name: values.business_name,
        business_type: values.business_type,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone,
        website: values.website,
        description: values.description,
        desired_tier: values.desired_tier,
      });
      toast.success("Application received. We'll reply by email.");
      form.reset({ ...form.getValues(), business_name: "", contact_phone: "", website: "", description: "" });
    } catch {
      // handleError already ran in the mutation's onError.
      toast.error("That didn't send. Try again, or email us instead.");
    }
  });

  if (!user) return null;

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-labelledby="partnership-apply-heading">
        <h3 id="partnership-apply-heading" className="text-lg font-semibold">
          Apply as a partner
        </h3>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Which fits best?</legend>
          <Controller
            control={form.control}
            name="desired_tier"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {PARTNERSHIP_TIERS.map((tier) => (
                  <Button
                    key={tier}
                    type="button"
                    variant={field.value === tier ? "default" : "outline"}
                    aria-pressed={field.value === tier}
                    className="min-h-11"
                    onClick={() => field.onChange(tier)}
                  >
                    {TIER_LABEL[tier]}
                  </Button>
                ))}
              </div>
            )}
          />
          <p className="max-w-prose text-xs text-muted-foreground">
            Tiers have no set price or package yet. Pick the closest fit and we'll work out the details with you
            by email.
          </p>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pa-business-name">Business name</Label>
            <Input
              id="pa-business-name"
              className="min-h-11"
              autoComplete="organization"
              aria-invalid={!!errors.business_name}
              aria-describedby={errors.business_name ? "pa-business-name-error" : undefined}
              {...form.register("business_name")}
            />
            {errors.business_name && (
              <p id="pa-business-name-error" className="text-sm text-destructive">
                {errors.business_name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pa-business-type">Type of business</Label>
            <Controller
              control={form.control}
              name="business_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pa-business-type" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pa-contact-email">Email</Label>
            <Input
              id="pa-contact-email"
              type="email"
              className="min-h-11"
              autoComplete="email"
              aria-invalid={!!errors.contact_email}
              aria-describedby={errors.contact_email ? "pa-contact-email-error" : undefined}
              {...form.register("contact_email")}
            />
            {errors.contact_email && (
              <p id="pa-contact-email-error" className="text-sm text-destructive">
                {errors.contact_email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pa-contact-phone">Phone (optional)</Label>
            <Input
              id="pa-contact-phone"
              type="tel"
              className="min-h-11"
              autoComplete="tel"
              {...form.register("contact_phone")}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="pa-website">Website (optional)</Label>
            <Input
              id="pa-website"
              type="url"
              className="min-h-11"
              placeholder="https://"
              aria-invalid={!!errors.website}
              aria-describedby={errors.website ? "pa-website-error" : undefined}
              {...form.register("website")}
            />
            {errors.website && (
              <p id="pa-website-error" className="text-sm text-destructive">
                {errors.website.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pa-description">What would you like from us? (optional)</Label>
          <Textarea
            id="pa-description"
            rows={4}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "pa-description-error" : undefined}
            {...form.register("description")}
          />
          {errors.description && (
            <p id="pa-description-error" className="text-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>

        <Button type="submit" className="min-h-11" disabled={submit.isPending} aria-busy={submit.isPending}>
          {submit.isPending ? "Sending..." : "Send application"}
        </Button>
      </form>

      {applications.isError && (
        <p className="text-sm text-destructive" role="alert">
          Your earlier applications didn't load.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => applications.refetch()}
          >
            Try again
          </button>
        </p>
      )}

      {applications.data && applications.data.length > 0 && (
        <section aria-labelledby="partnership-history-heading" className="space-y-3">
          <h3 id="partnership-history-heading" className="text-lg font-semibold">
            Your applications
          </h3>
          <ul className="divide-y rounded-lg border">
            {applications.data.map((application) => (
              <li key={application.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{application.business_name}</span>
                  <Badge
                    variant={application.status === "rejected" ? "destructive" : application.status === "approved" ? "default" : "secondary"}
                  >
                    {applicationStatusLabel(application.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {businessTypeLabel(application.business_type)}
                  <span aria-hidden="true"> - </span>
                  {TIER_LABEL[application.desired_tier as PartnershipTier] ?? application.desired_tier}
                  <span aria-hidden="true"> - </span>
                  Sent {format(new Date(application.created_at), "MMMM d, yyyy")}
                </p>
                {application.admin_notes && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">Note from us:</span> {application.admin_notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
