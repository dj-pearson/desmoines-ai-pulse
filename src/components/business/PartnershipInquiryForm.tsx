import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContactForm } from "@/hooks/useContactForm";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  business: z.string().trim().min(1, "Enter your business name.").max(200),
  email: z.string().trim().email("Enter an email we can reply to."),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more, at least 10 characters.")
    .max(4000, "Keep it under 4,000 characters."),
});

type FormValues = z.infer<typeof schema>;

/**
 * The signed-out way in (business plan WP3 item 4). Writes contact_submissions
 * with inquiry_type 'partnership' through useContactForm, which anyone may
 * insert into (RLS_AUDIT.md:231), so an owner can ask a question without
 * making an account first.
 */
export function PartnershipInquiryForm() {
  const { submitContactForm, loading } = useContactForm();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", business: "", email: "", message: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    // useContactForm toasts success and failure itself and reports the error.
    const ok = await submitContactForm(
      {
        name: values.name,
        email: values.email,
        subject: `Partnership: ${values.business}`,
        message: values.message,
        inquiry_type: "partnership",
      },
      { sourcePage: "/business-partnership" },
    );
    if (ok) {
      setSentTo(values.email);
      form.reset();
    }
  });

  if (sentTo) {
    return (
      <div role="status" className="space-y-2">
        <p className="font-medium">Thanks, that's with us.</p>
        <p className="text-sm text-muted-foreground">We'll reply to {sentTo}.</p>
        <Button variant="outline" className="min-h-11" onClick={() => setSentTo(null)}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-labelledby="partnership-inquiry-heading">
      <h3 id="partnership-inquiry-heading" className="text-lg font-semibold">
        Ask us about your business
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pi-name">Your name</Label>
          <Input
            id="pi-name"
            className="min-h-11"
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "pi-name-error" : undefined}
            {...form.register("name")}
          />
          {errors.name && (
            <p id="pi-name-error" className="text-sm text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pi-business">Business</Label>
          <Input
            id="pi-business"
            className="min-h-11"
            autoComplete="organization"
            aria-invalid={!!errors.business}
            aria-describedby={errors.business ? "pi-business-error" : undefined}
            {...form.register("business")}
          />
          {errors.business && (
            <p id="pi-business-error" className="text-sm text-destructive">
              {errors.business.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="pi-email">Email</Label>
          <Input
            id="pi-email"
            type="email"
            className="min-h-11"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "pi-email-error" : undefined}
            {...form.register("email")}
          />
          {errors.email && (
            <p id="pi-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pi-message">What can we help with?</Label>
        <Textarea
          id="pi-message"
          rows={5}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "pi-message-error" : undefined}
          {...form.register("message")}
        />
        {errors.message && (
          <p id="pi-message-error" className="text-sm text-destructive">
            {errors.message.message}
          </p>
        )}
      </div>
      <Button type="submit" className="min-h-11" disabled={loading} aria-busy={loading}>
        {loading ? "Sending..." : "Send"}
      </Button>
    </form>
  );
}
