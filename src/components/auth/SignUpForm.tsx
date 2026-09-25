import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { passwordSchema } from "@/lib/passwordStrength";
import { SecurityUtils } from "@/lib/securityUtils";
import { EMAIL_FORMAT_MESSAGE } from "@/components/auth/SignInForm";

/**
 * COPPA. We don't collect verifiable parental consent, so the rule is nobody
 * under 13. The attestation is recorded as `at_least_13` in the consent block;
 * no date of birth is asked for or stored.
 */
export const UNDER_13_MESSAGE =
  "You need to be 13 or older to have an account. If you're a parent setting one up for a child, email privacy@desmoinesinsider.com.";

const signUpSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .refine((value) => SecurityUtils.validateEmail(value).isValid, EMAIL_FORMAT_MESSAGE),
  password: passwordSchema,
  isAtLeast13: z.boolean().refine((v) => v, UNDER_13_MESSAGE),
  termsAccepted: z.boolean().refine((v) => v, "Tick this to create an account."),
  // Explicit opt-ins. Unticked by default and never required.
  emailNotifications: z.boolean(),
  eventRecommendations: z.boolean(),
});

export type SignUpValues = z.infer<typeof signUpSchema>;

/** A field-level problem the handler found after submit (disposable domain, weak password). */
export interface SignUpFieldError {
  field: "email" | "password";
  message: string;
}

interface SignUpFormProps {
  defaultEmail?: string;
  /** Resolves with a field error to show inline, or nothing. */
  onSubmit: (values: SignUpValues) => Promise<SignUpFieldError | void>;
}

/**
 * Sign-up in four fields (account plan WP1 item 5): email, password, age and
 * terms. Everything the old form asked for up front either had no reader
 * (business fields, location, SMS) or belongs to a later moment (interests,
 * on the first dashboard visit). The submit button stays enabled; a missing
 * tick is reported on the checkbox that needs it rather than by a dead button.
 */
export function SignUpForm({ defaultEmail = "", onSubmit }: SignUpFormProps) {
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: defaultEmail,
      password: "",
      isAtLeast13: false,
      termsAccepted: false,
      emailNotifications: false,
      eventRecommendations: false,
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const isSubmitting = form.formState.isSubmitting;
  const password = form.watch("password");

  const submit = form.handleSubmit(async (values) => {
    const fieldError = await onSubmit(values);
    if (fieldError) {
      form.setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
              <FormMessage />
              <PasswordStrengthMeter password={password} showRequirements />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isAtLeast13"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-start gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    aria-required="true"
                    className="mt-0.5"
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal leading-snug">
                  I'm 13 or older
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="termsAccepted"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-start gap-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    aria-required="true"
                    className="mt-0.5"
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal leading-snug">
                  I agree to the{" "}
                  <Link to="/terms" target="_blank" rel="noopener" className="text-primary underline hover:no-underline">
                    Terms of Service
                  </Link>
                  ,{" "}
                  <Link to="/privacy-policy" target="_blank" rel="noopener" className="text-primary underline hover:no-underline">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link to="/acceptable-use" target="_blank" rel="noopener" className="text-primary underline hover:no-underline">
                    Acceptable Use Policy
                  </Link>
                  .
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* The two opt-ins stay unticked and out of the way. <details> keeps
            them one tap from view without counting as fields to fill; the
            third, SMS, is gone because nothing sends SMS. */}
        <details className="group rounded-xl border px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            Emails and recommendations (optional)
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-3 space-y-3">
            <FormField
              control={form.control}
              name="emailNotifications"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal leading-snug">
                    Email me about events, restaurants and offers. I can unsubscribe any time.
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventRecommendations"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal leading-snug">
                    Use what I save and view to suggest events. I can turn this off any time.
                  </FormLabel>
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Both start off. Account emails, like confirmations and password resets, are sent either way.
            </p>
          </div>
        </details>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating your account..." : "Create account"}
        </Button>

        <p className="text-sm text-muted-foreground">
          Advertising a business?{" "}
          <Link to="/advertise" className="text-primary underline-offset-4 hover:underline">
            Start at /advertise
          </Link>
          .
        </p>
      </form>
    </Form>
  );
}
